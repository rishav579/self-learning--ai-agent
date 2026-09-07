/**
 * Planner: produces a structured plan (zod-validated) that incorporates
 * retrieved lessons, similar experiences and the recommended strategy.
 * Fails OPEN with a minimal single-step plan if the LLM is unavailable.
 */
import { logger } from '@/lib/logger'
import type { LlmClient } from '@/lib/llm'
import { truncate } from '@/lib/llm'
import { PlanSchema } from './schemas'
import type { Plan, RetrievedMemory, StrategyStats, Understanding } from './types'
import { getToolCatalog } from './tools/registry'
import { renderMemoryForPrompt } from './memory/retrieval'

export interface PlanContext {
  understanding: Understanding
  memory: RetrievedMemory | null
  strategy: StrategyStats | null
  strategyCandidates: StrategyStats[]
}

function strategyBlock(strategy: StrategyStats | null, candidates: StrategyStats[]): string {
  if (candidates.length === 0) return 'No strategy statistics available yet — this is an early task of its kind.'
  const table = candidates
    .map((s) => `- "${s.name}": used ${s.uses}x, success rate ${(s.successRate * 100).toFixed(0)}%, mean score ${s.meanScore.toFixed(2)} — ${truncate(s.description, 160)}`)
    .join('\n')
  const chosen = strategy ? `Recommended strategy (best historical performance): "${strategy.name}".\n` : ''
  return `${chosen}Known strategies for this task category:\n${table}`
}

export async function createPlan(
  taskId: string,
  taskInput: string,
  ctx: PlanContext,
  llm: LlmClient,
): Promise<Plan> {
  const memoryBlock = ctx.memory ? await renderMemoryForPrompt(ctx.memory) : 'Memory disabled for this run.'
  const catalog = getToolCatalog()
    .map((t) => `- ${t.name}: ${t.description}\n  args example: ${t.argsShape}`)
    .join('\n')

  try {
    const plan = await llm.chatJson<Plan>({
      label: 'plan',
      system: `You are the planning module of a self-improving AI agent. Create a short, concrete, step-by-step plan.
Rules:
- 2 to 6 steps maximum; each step is one concrete action.
- Prefer steps that use tools when tools fit the job (exact arithmetic → calculator, exact algorithms → code_executor, file facts → list_files/file_inspector, public facts → web_search).
- If LESSONS are provided, incorporate them: they were learned from real past successes/failures.
- If a RECOMMENDED STRATEGY is provided, follow it unless it clearly does not apply.
- success_criteria must be objectively checkable statements.`,
      prompt: `TASK: ${taskInput}

Understanding: goal="${ctx.understanding.goal}", category=${ctx.understanding.category}, risk=${ctx.understanding.riskLevel}, complexity=${ctx.understanding.complexity}

${memoryBlock}

${strategyBlock(ctx.strategy, ctx.strategyCandidates)}

AVAILABLE TOOLS:
${catalog}`,
      shapeHint: `{"goal": "what this plan achieves", "steps": ["step 1", "step 2"], "toolsRequired": ["tool names"], "riskLevel": "low|medium|high", "successCriteria": ["checkable statements"]}`,
      schema: PlanSchema,
      attempts: 2,
    })
    logger.info('plan:ok', { taskId, steps: plan.steps.length, tools: plan.toolsRequired })
    return plan
  } catch (e) {
    logger.warn('plan:fallback', { taskId, error: (e as Error).message })
    return {
      goal: taskInput.slice(0, 200),
      steps: ['Analyze the task and solve it using the most appropriate available tools, then state the final answer.'],
      toolsRequired: [],
      riskLevel: 'low',
      successCriteria: ['The final answer satisfies the task.'],
    }
  }
}
