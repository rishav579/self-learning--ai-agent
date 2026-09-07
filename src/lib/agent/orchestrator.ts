/**
 * Orchestrator: the complete self-improvement loop.
 *
 *   task → understand → retrieve memory → select strategy → plan →
 *   execute (ReAct + tools) → evaluate (objective-first) → reflect →
 *   store experience/lesson → update strategy stats → next task improves
 *
 * Failure philosophy: every stage degrades gracefully; a task only lands in
 * `failed` status when the execution itself could not produce a result.
 */
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { LlmClient } from '@/lib/llm'
import { truncate } from '@/lib/llm'
import { createLlmClient } from '@/lib/llm'
import { modeCapabilities } from './types'
import type { AgentMode, CheckSpec, EvaluationResult, Reflection, RetrievedMemory, StrategyStats, Understanding } from './types'
import { understandTask } from './understand'
import { retrieveRelevantMemory } from './memory/retrieval'
import { rankStrategies, recordLessonUsage, storeExperience, storeLesson, updateStrategyStats } from './memory/store'
import { createPlan } from './planner'
import { executeTask } from './executor'
import { evaluateTask, persistEvaluation } from './evaluator'
import { reflectOnRun } from './reflector'
import { CheckSpecSchema } from './schemas'

export interface RunTaskOptions {
  mode?: AgentMode
  llm?: LlmClient // injectable for tests
  benchmarkRunId?: string
}

async function logEvent(
  taskId: string,
  type: string,
  payload: Record<string, unknown>,
  durationMs?: number,
): Promise<void> {
  try {
    await db.agentEvent.create({
      data: { taskId, type, payload: JSON.stringify(payload), durationMs: durationMs ?? null },
    })
  } catch (e) {
    logger.error('orchestrator:event-log-failed', { taskId, type, error: (e as Error).message })
  }
}

async function setStatus(taskId: string, status: string): Promise<void> {
  await db.task.update({ where: { id: taskId }, data: { status } }).catch((e: Error) => {
    logger.error('orchestrator:set-status-failed', { taskId, status, error: e.message })
  })
}

/**
 * Run the full agent loop for one task. Resolves with the final task row.
 */
export async function runAgentTask(taskId: string, options: RunTaskOptions = {}): Promise<void> {
  const mode: AgentMode = options.mode ?? 'full'
  const caps = modeCapabilities(mode)
  const llm = options.llm ?? createLlmClient()
  const t0 = Date.now()
  let llmCalls = 0
  const bumpLlm = async () => {
    llmCalls++
    await db.task.update({ where: { id: taskId }, data: { llmCalls } }).catch(() => {})
  }
  // wrap llm to count calls
  const countedLlm: LlmClient = {
    chatJson: async <T,>(o: Parameters<LlmClient['chatJson']>[0]) => {
      const r = await llm.chatJson<T>(o)
      await bumpLlm()
      return r
    },
  }

  const task = await db.task.findUnique({ where: { id: taskId } })
  if (!task) throw new Error(`Task ${taskId} not found`)
  await db.task.update({
    where: { id: taskId },
    data: { startedAt: new Date(), status: 'understanding', benchmarkRunId: options.benchmarkRunId ?? task.benchmarkRunId },
  })
  await logEvent(taskId, 'task_started', { mode, input: truncate(task.input, 300) })

  try {
    // 1. UNDERSTAND --------------------------------------------------------
    await setStatus(taskId, 'understanding')
    const understanding: Understanding = await understandTask(taskId, task.input, countedLlm)
    await db.task.update({ where: { id: taskId }, data: { understanding: JSON.stringify(understanding) } })
    await logEvent(taskId, 'understanding', { ...understanding })

    // 2. RETRIEVE ----------------------------------------------------------
    let memory: RetrievedMemory | null = null
    if (caps.retrieveExperiences || caps.retrieveLessons) {
      await setStatus(taskId, 'retrieving')
      // query enrichment: the understanding module's goal + keywords describe
      // the task in more general vocabulary than the raw input, which makes
      // cross-task lesson retrieval substantially more reliable (a lesson
      // about "arithmetic answer format" should surface for any arithmetic task)
      const retrievalQuery = `${task.input}\n${understanding.goal}\n${understanding.keywords.join(' ')}`
      memory = await retrieveRelevantMemory(retrievalQuery, understanding.category)
      if (!caps.retrieveLessons) memory = { lessons: [], experiences: memory.experiences, lessonIds: [] }
      if (!caps.retrieveExperiences) memory = { lessons: memory.lessons, experiences: [], lessonIds: memory.lessonIds }
      await db.task.update({ where: { id: taskId }, data: { retrievedMemory: JSON.stringify(memory) } })
      await logEvent(taskId, 'memory_retrieved', {
        lessons: memory.lessons.length,
        experiences: memory.experiences.length,
        detail: memory,
      })
    } else {
      await logEvent(taskId, 'memory_retrieved', { skipped: true, reason: 'memory disabled for mode ' + mode })
    }

    // 3. STRATEGY ----------------------------------------------------------
    let strategy: StrategyStats | null = null
    let strategyCandidates: StrategyStats[] = []
    if (caps.selectStrategy) {
      strategyCandidates = await rankStrategies(understanding.category, 3)
      strategy = strategyCandidates[0] ?? null
      await db.task.update({
        where: { id: taskId },
        data: { selectedStrategy: strategy ? JSON.stringify(strategy) : null, strategyName: strategy?.name ?? null },
      })
      await logEvent(taskId, 'strategy_selected', {
        strategy: strategy?.name ?? null,
        candidates: strategyCandidates.map((s) => ({ name: s.name, successRate: Math.round(s.successRate * 100) / 100, uses: s.uses })),
      })
    }

    // 4. PLAN --------------------------------------------------------------
    await setStatus(taskId, 'planning')
    const plan = await createPlan(taskId, task.input, { understanding, memory, strategy, strategyCandidates }, countedLlm)
    await db.task.update({ where: { id: taskId }, data: { plan: JSON.stringify(plan) } })
    await logEvent(taskId, 'plan_created', { ...plan })

    // 5. EXECUTE -----------------------------------------------------------
    await setStatus(taskId, 'executing')
    const trace = await executeTask(taskId, task.input, understanding, plan, memory, strategy, countedLlm)
    await db.task.update({ where: { id: taskId }, data: { result: trace.result, iterations: trace.iterations } })
    await logEvent(
      taskId,
      'execution_finished',
      {
        iterations: trace.iterations,
        toolCalls: trace.toolCalls.length,
        iterationExhausted: trace.iterationExhausted,
      },
    )

    // 6. EVALUATE ----------------------------------------------------------
    await setStatus(taskId, 'evaluating')
    const toolExecutions = await db.toolExecution.findMany({
      where: { taskId },
      select: { tool: true, success: true, error: true },
    })
    const userChecks: CheckSpec[] = task.checks ? safeParseChecks(task.checks) : []
    const evaluation: EvaluationResult = await evaluateTask(
      taskId,
      userChecks,
      {
        taskInput: task.input,
        result: trace.result,
        toolExecutions,
        iterations: trace.iterations,
        maxIterations: 8,
        iterationExhausted: trace.iterationExhausted,
      },
      countedLlm,
    )
    await persistEvaluation(taskId, evaluation)
    await db.task.update({
      where: { id: taskId },
      data: { score: evaluation.score, success: evaluation.success },
    })
    await logEvent(taskId, 'evaluation', {
      score: evaluation.score,
      success: evaluation.success,
      objective: evaluation.objective,
      checks: evaluation.checks,
    })

    // 7. REFLECT -----------------------------------------------------------
    let reflection: Reflection | null = null
    await setStatus(taskId, 'reflecting')
    reflection = await reflectOnRun(taskId, task.input, plan, trace.transcript, evaluation, countedLlm)
    if (reflection) {
      await logEvent(taskId, 'reflection', { ...reflection })
    } else {
      await logEvent(taskId, 'reflection', { failed: true, note: 'reflection unavailable; run stored without a new lesson' })
    }

    // 8. STORE -------------------------------------------------------------
    await setStatus(taskId, 'storing')
    if (caps.storeExperiences || caps.storeLessons || caps.updateStrategyStats) {
      let lessonId: string | null = null
      if (caps.storeLessons && reflection) {
        const stored = await storeLesson(reflection, understanding.category, taskId)
        lessonId = stored.lessonId
        await logEvent(taskId, 'lesson_stored', {
          lessonId: stored.lessonId,
          deduplicated: stored.deduplicated,
          similarity: Math.round(stored.similarity * 100) / 100,
          content: reflection.lesson.content,
        })
      }
      if (caps.storeExperiences) {
        const experience = await storeExperience({
          taskId,
          taskSummary: understanding.goal || task.input.slice(0, 200),
          category: understanding.category,
          context: `mode=${mode}; strategy=${strategy?.name ?? 'none'}; retrievedLessons=${memory?.lessons.length ?? 0}; retrievedExperiences=${memory?.experiences.length ?? 0}`,
          actionsSummary: trace.transcript
            .filter((t) => t.tool)
            .map((t) => `${t.tool}(${JSON.stringify(t.args ?? {}).slice(0, 120)}) → ${t.observation?.slice(0, 160)}`),
          outcome: evaluation.success ? 'success' : 'failure',
          score: evaluation.score,
          success: evaluation.success,
          successfulApproach: evaluation.success ? plan.steps.join(' → ').slice(0, 800) : null,
          failedApproach: evaluation.success ? null : trace.transcript.map((t) => t.observation).filter(Boolean).join(' | ').slice(0, 800),
          strategyName: strategy?.name ?? reflection?.lesson.strategyName ?? null,
          lessonId,
          keywords: understanding.keywords,
        })
        await logEvent(taskId, 'experience_stored', { experienceId: experience.id })
      }
      if (caps.updateStrategyStats) {
        const stratName = strategy?.name ?? reflection?.lesson.strategyName
        if (stratName) {
          const description = reflection?.lesson.strategyName === stratName && reflection?.doDifferently
            ? `${strategy?.description ?? ''} Learned refinement: ${reflection.doDifferently}`.slice(0, 500)
            : (strategy?.description ?? reflection?.lesson.content ?? '').slice(0, 500)
          await updateStrategyStats(stratName, understanding.category, description, evaluation.score, evaluation.success)
          await logEvent(taskId, 'strategy_updated', {
            strategy: stratName,
            score: evaluation.score,
            success: evaluation.success,
          })
        }
      }
      if (memory && memory.lessonIds.length > 0) {
        await recordLessonUsage(memory.lessonIds, evaluation.score, evaluation.success)
      }
    }

    // 9. DONE --------------------------------------------------------------
    await db.task.update({
      where: { id: taskId },
      data: { status: 'completed', completedAt: new Date() },
    })
    await logEvent(
      taskId,
      'task_completed',
      { score: evaluation.score, success: evaluation.success, durationMs: Date.now() - t0 },
      Date.now() - t0,
    )
    logger.info('task:completed', {
      taskId,
      mode,
      score: evaluation.score,
      success: evaluation.success,
      durationMs: Date.now() - t0,
    })
  } catch (e) {
    const message = (e as Error).message ?? String(e)
    logger.error('task:failed', { taskId, error: message })
    await db.task
      .update({ where: { id: taskId }, data: { status: 'failed', error: truncate(message, 1000), completedAt: new Date() } })
      .catch((dbErr: Error) => {
        // surface why the task row could not be marked failed (restart
        // recovery will reconcile it on next boot)
        logger.error('task:failed-status-update-failed', { taskId, error: dbErr.message })
      })
    await logEvent(taskId, 'task_failed', { error: truncate(message, 500) })
  }
}

function safeParseChecks(raw: string): CheckSpec[] {
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    // validate every entry against the API schema: corrupted/unknown entries
    // are DROPPED (a corrupt check must not silently fail the task; dropping
    // degrades to the internal+subjective evaluation path instead)
    return v.flatMap((c) => {
      const parsed = CheckSpecSchema.safeParse(c)
      return parsed.success ? [parsed.data] : []
    })
  } catch {
    return []
  }
}
