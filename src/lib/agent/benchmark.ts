/**
 * Learning-loop experiment runner.
 *
 * Runs a FIXED task set (with objective checks) under different modes:
 *   A no_memory        — no retrieval, no storage
 *   B memory_only      — experience retrieval + storage
 *   C memory_reflection— + lesson extraction & retrieval
 *   D full             — + strategy selection & statistics
 *
 * EXPERIMENT DESIGN (honesty notes):
 *  1. For the `hard` task set, memory is RESET before each mode so every
 *     mode starts from the same clean state and only accumulates its OWN
 *     experience. This makes A/B/C/D a controlled comparison of capability
 *     levels rather than a cumulative sequence where later modes inherit
 *     earlier modes' memories. (For the legacy default/quick sets the
 *     original sequential behavior is kept.)
 *  2. All results are recorded as they actually happened — no fabrication.
 *  3. Efficiency is measured too (llmCalls, iterations, durationMs) because
 *     on tasks where score ceilings, memory still shortens discovery.
 */
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { runAgentTask } from './orchestrator'
import { BENCHMARK_MODE_ORDER, getBenchmarkSet } from './presets'
import type { AgentMode } from './types'
import type { LlmClient } from '@/lib/llm'
import { createLlmClient } from '@/lib/llm'
import { withAgentLock } from './runner'

/** Pause between benchmark tasks to stay well under API rate limits. */
const INTER_TASK_PAUSE_MS = 8_000
/** When a task dies from API throttling, cool down before the next one. */
const RATE_LIMIT_COOLDOWN_MS = 90_000

export interface BenchmarkPerTask {
  taskId: string
  title: string
  score: number
  success: boolean
  iterations: number
  llmCalls: number
  toolCalls: number
  durationMs: number
}

export interface BenchmarkModeResult {
  mode: AgentMode
  perTask: BenchmarkPerTask[]
  meanScore: number
  successRate: number
  totalToolCalls: number
  totalLlmCalls: number
  meanIterations: number
  meanDurationMs: number
  totalDurationMs: number
}

/**
 * Launch a benchmark run in the background. Returns the run row immediately.
 * `interTaskPauseMs` and `llm` are injection points for tests (no network).
 */
export async function launchBenchmark(opts: {
  taskSet: string
  modes?: AgentMode[]
  llm?: LlmClient
  interTaskPauseMs?: number
}): Promise<{ id: string }> {
  const running = await db.benchmarkRun.findFirst({ where: { status: 'running' } })
  if (running) {
    throw new Error('A benchmark is already running. Wait for it to finish.')
  }
  const modes = opts.modes && opts.modes.length > 0 ? opts.modes : BENCHMARK_MODE_ORDER
  const run = await db.benchmarkRun.create({
    data: {
      taskSet: opts.taskSet,
      modes: JSON.stringify(modes),
      status: 'running',
    },
  })
  // fire and forget — status tracked in the DB
  void runBenchmark(run.id, opts.taskSet, modes, opts.llm, opts.interTaskPauseMs ?? INTER_TASK_PAUSE_MS).catch(async (e: Error) => {
    logger.error('benchmark:crashed', { runId: run.id, error: e.message })
    await db.benchmarkRun.update({
      where: { id: run.id },
      data: { status: 'failed', error: e.message.slice(0, 1000) },
    })
  })
  return { id: run.id }
}

async function resetMemory(): Promise<void> {
  await db.$transaction([
    db.experience.deleteMany({}),
    db.lesson.deleteMany({}),
    db.strategy.deleteMany({}),
  ])
}

async function runBenchmark(
  runId: string,
  taskSetName: string,
  modes: AgentMode[],
  injectedLlm?: LlmClient,
  interTaskPauseMs: number = INTER_TASK_PAUSE_MS,
): Promise<void> {
  const tasks = getBenchmarkSet(taskSetName)
  const llm = injectedLlm ?? createLlmClient()
  const results: Partial<Record<AgentMode, BenchmarkModeResult>> = {}
  const startedAt = Date.now()
  // controlled comparison: each mode starts from a clean memory state
  const resetBetweenModes = taskSetName === 'hard'

  // The whole benchmark goes through the SAME agent mutex as user tasks, so
  // LLM calls are never issued in parallel (rate-limit protection).
  await withAgentLock(async () => {
    for (const mode of modes) {
      if (resetBetweenModes) {
        await resetMemory()
        logger.info('benchmark:memory-reset', { runId, mode })
      }
      const perTask: BenchmarkPerTask[] = []
      for (const preset of tasks) {
        const task = await db.task.create({
          data: {
            title: `[${mode}] ${preset.title}`,
            input: preset.input,
            checks: JSON.stringify(preset.checks),
            mode,
            benchmarkRunId: runId,
          },
        })
        const t0 = Date.now()
        await runAgentTask(task.id, { mode, llm, benchmarkRunId: runId })
        const done = await db.task.findUnique({
          where: { id: task.id },
          select: { score: true, success: true, iterations: true, llmCalls: true, status: true, error: true },
        })
        const toolCalls = await db.toolExecution.count({ where: { taskId: task.id } })
        perTask.push({
          taskId: task.id,
          title: preset.title,
          score: done?.score ?? 0,
          success: done?.success ?? false,
          iterations: done?.iterations ?? 0,
          llmCalls: done?.llmCalls ?? 0,
          toolCalls,
          durationMs: Date.now() - t0,
        })
        await db.benchmarkRun.update({
          where: { id: runId },
          data: { results: JSON.stringify(results) },
        })
        // pacing: let the API rate limiter recover between tasks
        await new Promise((r) => setTimeout(r, interTaskPauseMs))
        // if this task was killed by throttling, cool down longer — the API
        // recovers after ~2 quiet minutes (observed empirically)
        if (done?.error && /429|too many requests/i.test(done.error)) {
          logger.warn('benchmark:rate-limit-cooldown', { runId, taskId: task.id, ms: RATE_LIMIT_COOLDOWN_MS })
          await new Promise((r) => setTimeout(r, RATE_LIMIT_COOLDOWN_MS))
        }
      }
      const n = perTask.length
      results[mode] = {
        mode,
        perTask,
        meanScore: n > 0 ? round3(perTask.reduce((s, t) => s + t.score, 0) / n) : 0,
        successRate: n > 0 ? round3(perTask.filter((t) => t.success).length / n) : 0,
        totalToolCalls: perTask.reduce((s, t) => s + t.toolCalls, 0),
        totalLlmCalls: perTask.reduce((s, t) => s + t.llmCalls, 0),
        meanIterations: n > 0 ? round3(perTask.reduce((s, t) => s + t.iterations, 0) / n) : 0,
        meanDurationMs: n > 0 ? Math.round(perTask.reduce((s, t) => s + t.durationMs, 0) / n) : 0,
        totalDurationMs: Date.now() - startedAt,
      }
      await db.benchmarkRun.update({
        where: { id: runId },
        data: { results: JSON.stringify(results) },
      })
    }
  })

  await db.benchmarkRun.update({
    where: { id: runId },
    data: { status: 'completed', results: JSON.stringify(results) },
  })
  logger.info('benchmark:completed', { runId, modes: modes.join(','), durationMs: Date.now() - startedAt })
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
