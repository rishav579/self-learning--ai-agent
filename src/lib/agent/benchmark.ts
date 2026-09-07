/**
 * Learning-loop experiment runner.
 *
 * Runs a FIXED task set (with objective checks) under different modes:
 *   A no_memory        — no retrieval, no storage
 *   B memory_only      — experience retrieval + storage
 *   C memory_reflection— + lesson extraction & retrieval
 *   D full             — + strategy selection & statistics
 *
 * IMPORTANT HONESTY NOTE: each mode is executed against the SAME persistent
 * database, sequentially in mode order A→D. Because modes share memory only
 * through the DB, A/B/C/D compare "what the agent could know at that point".
 * The cleanest comparison is a fresh database per benchmark run (the UI
 * offers a "clear memory" reset before running). Results are recorded as
 * they actually happened — no fabrication.
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
  totalDurationMs: number
}

export function isBenchmarkRunning(): Promise<boolean> {
  return db.benchmarkRun
    .findFirst({ where: { status: 'running' }, select: { id: true } })
    .then((r) => r !== null)
}

/**
 * Launch a benchmark run in the background. Returns the run row immediately.
 */
export async function launchBenchmark(opts: {
  taskSet: string
  modes?: AgentMode[]
  llm?: LlmClient
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
  void runBenchmark(run.id, opts.taskSet, modes, opts.llm).catch(async (e: Error) => {
    logger.error('benchmark:crashed', { runId: run.id, error: e.message })
    await db.benchmarkRun.update({
      where: { id: run.id },
      data: { status: 'failed', error: e.message.slice(0, 1000) },
    })
  })
  return { id: run.id }
}

async function runBenchmark(
  runId: string,
  taskSetName: string,
  modes: AgentMode[],
  injectedLlm?: LlmClient,
): Promise<void> {
  const tasks = getBenchmarkSet(taskSetName)
  const llm = injectedLlm ?? createLlmClient()
  const results: Partial<Record<AgentMode, BenchmarkModeResult>> = {}
  const startedAt = Date.now()

  // The whole benchmark goes through the SAME agent mutex as user tasks, so
  // LLM calls are never issued in parallel (rate-limit protection).
  await withAgentLock(async () => {
    for (const mode of modes) {
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
        await new Promise((r) => setTimeout(r, INTER_TASK_PAUSE_MS))
        // if this task was killed by throttling, cool down longer — the API
        // recovers after ~2 quiet minutes (observed empirically)
        if (done?.error && /429|too many requests/i.test(done.error)) {
          logger.warn('benchmark:rate-limit-cooldown', { runId, taskId: task.id, ms: RATE_LIMIT_COOLDOWN_MS })
          await new Promise((r) => setTimeout(r, RATE_LIMIT_COOLDOWN_MS))
        }
      }
      const meanScore = perTask.length > 0 ? round3(perTask.reduce((s, t) => s + t.score, 0) / perTask.length) : 0
      results[mode] = {
        mode,
        perTask,
        meanScore,
        successRate: perTask.length > 0 ? round3(perTask.filter((t) => t.success).length / perTask.length) : 0,
        totalToolCalls: perTask.reduce((s, t) => s + t.toolCalls, 0),
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
