/**
 * Executor: a bounded ReAct loop.
 * Each iteration the LLM emits ONE structured action:
 *   {"action":"tool", "tool": "...", "args": {...}, "thought": "..."}  or
 *   {"action":"final", "answer": "...", "thought": "..."}
 * Tool calls go through the registry (allowlist + validation + logging).
 * The loop is bounded by MAX_ITERATIONS and every observation is fed back
 * into a compact, rebuilt transcript so the LLM always sees full context.
 */
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { LlmClient } from '@/lib/llm'
import { truncate } from '@/lib/llm'
import { ExecutorActionSchema } from './schemas'
import type { ExecutorAction, Plan, RetrievedMemory, StrategyStats, Understanding } from './types'
import { executeToolCall, getToolCatalog, toolExists } from './tools/registry'

export const MAX_ITERATIONS = 8
const OBSERVATION_TRUNCATE = 2000
/** Patience for consecutive LLM failures (429 windows can last ~2 min). */
const MAX_EXECUTOR_LLM_RETRIES = 5

export interface ExecutionTrace {
  result: string | null
  iterations: number
  iterationExhausted: boolean
  toolCalls: { tool: string; success: boolean }[]
  transcript: { thought: string; tool?: string; args?: unknown; observation?: string; answer?: string }[]
}

function buildSystemPrompt(): string {
  const catalog = getToolCatalog()
    .map((t) => `- ${t.name}: ${t.description}\n  args example: ${t.argsShape}`)
    .join('\n')
  return `You are the execution module of a self-improving AI agent. You follow the plan and use tools to complete the task.

AVAILABLE TOOLS (the ONLY actions you can take):
${catalog}

RULES:
- Respond with a single JSON object: {"action":"tool","tool":"<name>","args":{...},"thought":"why"} to call a tool, or {"action":"final","answer":"<complete final answer>","thought":"why"} when the task is done.
- One tool call per response. Wait for the observation before the next action.
- Choose your own approach for each sub-problem; use whichever method you judge most reliable.
- For exact algorithms or string processing, code_executor is available.
- If a tool call fails, diagnose the error and either fix the arguments or try a different approach.
- Your final answer must be complete and self-contained: it should directly state the requested value or finding.
- Never fabricate tool output. Never claim a result you did not verify.`
}

/** Render the running transcript so the LLM sees ALL prior observations. */
function renderTranscript(trace: ExecutionTrace): string {
  if (trace.transcript.length === 0) return '(execution has not started yet)'
  return trace.transcript
    .map((t, i) => {
      const parts = [`[${i + 1}] thought: ${t.thought}`]
      if (t.tool) parts.push(`    called ${t.tool} with ${JSON.stringify(t.args ?? {}).slice(0, 400)}`)
      if (t.observation) parts.push(`    ${t.observation}`)
      if (t.answer) parts.push(`    FINAL ANSWER: ${t.answer}`)
      return parts.join('\n')
    })
    .join('\n')
}

export async function executeTask(
  taskId: string,
  taskInput: string,
  understanding: Understanding,
  plan: Plan,
  memory: RetrievedMemory | null,
  strategy: StrategyStats | null,
  llm: LlmClient,
): Promise<ExecutionTrace> {
  const trace: ExecutionTrace = {
    result: null,
    iterations: 0,
    iterationExhausted: false,
    toolCalls: [],
    transcript: [],
  }
  const memoryBlock = memory
    ? [
        memory.lessons.length > 0
          ? `Lessons learned from past tasks (apply unless clearly inapplicable):\n${memory.lessons.map((l) => `- (${l.type}) ${l.content}`).join('\n')}`
          : '',
        memory.experiences.length > 0
          ? `Similar past experiences:\n${memory.experiences.map((e) => `- "${e.summary}" → ${e.success ? 'SUCCESS' : 'FAILURE'} (score ${e.score.toFixed(2)})`).join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n') || '(no relevant memories)'
    : '(memory disabled for this run)'

  const strategyBlock = strategy
    ? `Recommended strategy based on past performance: "${strategy.name}" (used ${strategy.uses}x, success rate ${(strategy.successRate * 100).toFixed(0)}%). ${strategy.description}`
    : ''

  const baseContext = `TASK: ${taskInput}\n\nUnderstanding: category=${understanding.category}, risk=${understanding.riskLevel}\n\n${memoryBlock}\n${strategyBlock ? '\n' + strategyBlock + '\n' : ''}\nPLAN:\n${plan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`

  let llmRetries = 0
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    trace.iterations = i + 1
    let action: ExecutorAction | null = null
    try {
      action = await llm.chatJson<ExecutorAction>({
        label: 'execute',
        system: buildSystemPrompt(),
        prompt: `${baseContext}\n\nTRANSCRIPT SO FAR:\n${renderTranscript(trace)}\n\nProduce your NEXT action as a single JSON object.`,
        shapeHint: `{"action":"tool","tool":"tool_name","args":{...},"thought":"short reasoning"} OR {"action":"final","answer":"final answer text","thought":"short reasoning"}`,
        schema: ExecutorActionSchema,
        attempts: 3, // with exponential backoff for 429s
      })
      llmRetries = 0
    } catch (e) {
      llmRetries++
      logger.warn('executor:llm-failed', { taskId, iteration: i + 1, error: (e as Error).message })
      if (llmRetries >= MAX_EXECUTOR_LLM_RETRIES) {
        throw new Error(`Executor stopped: LLM failed ${llmRetries} times in a row (${(e as Error).message})`)
      }
      continue
    }

    await db.agentEvent.create({
      data: {
        taskId,
        type: 'iteration',
        payload: JSON.stringify({
          iteration: i + 1,
          thought: truncate(action.thought, 400),
          kind: action.action,
          tool: action.action === 'tool' ? action.tool : null,
        }),
      },
    })

    if (action.action === 'final') {
      trace.result = action.answer
      trace.transcript.push({ thought: action.thought, answer: action.answer })
      return trace
    }

    // Tool call path
    const toolName = action.tool
    if (!toolExists(toolName)) {
      const observation = `ERROR: Unknown tool "${toolName}". Allowed: ${getToolCatalog()
        .map((t) => t.name)
        .join(', ')}.`
      trace.transcript.push({ thought: action.thought, tool: toolName, args: action.args, observation })
      continue
    }

    const toolResult = await executeToolCall(taskId, toolName, action.args)
    trace.toolCalls.push({ tool: toolName, success: toolResult.success })
    trace.transcript.push({
      thought: action.thought,
      tool: toolName,
      args: toolResult.validatedArgs,
      observation: truncate(
        toolResult.success
          ? `OBSERVATION (from ${toolName}): ${toolResult.output}`
          : `OBSERVATION (from ${toolName}) — the call FAILED: ${toolResult.error}`,
        OBSERVATION_TRUNCATE,
      ),
    })
  }

  // Iteration budget exhausted without a final answer
  trace.iterationExhausted = true
  const lastObservation = [...trace.transcript].reverse().find((t) => t.observation)?.observation ?? ''
  trace.result = lastObservation
    ? `Iteration limit reached (${MAX_ITERATIONS}) without a final answer. Last observation: ${truncate(lastObservation, 800)}`
    : `Iteration limit reached (${MAX_ITERATIONS}) without a final answer.`
  logger.warn('executor:iteration-exhausted', { taskId, toolCalls: trace.toolCalls.length })
  return trace
}
