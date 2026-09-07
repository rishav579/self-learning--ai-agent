/**
 * Task runner: serializes agent runs through a single in-process queue
 * (one agent at a time — protects the LLM budget and SQLite writes) and
 * enforces queue-depth limits so the API can shed load.
 *
 * RESTART BEHAVIOR (documented MVP limitation):
 *   The queue itself is in-memory and does not survive a restart, BUT the
 *   database does. On server boot (src/instrumentation.ts) we reconcile:
 *     - tasks that had STARTED (non-terminal status + startedAt set) are
 *       marked `failed` with an "interrupted by server restart" error
 *       (never re-run automatically — tool side effects may already exist)
 *     - tasks still `pending` (never started) are re-enqueued so a restart
 *       does not silently lose submitted work.
 *
 * All mutable state lives on globalThis so it survives Next.js dev-mode
 * hot reloads (a re-imported module would otherwise see a second, empty
 * queue and load-shedding / busy-guards would silently stop working).
 */
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { runAgentTask } from './orchestrator'
import type { AgentMode } from './types'

const MAX_QUEUE_DEPTH = 8

const IN_FLIGHT_STATUSES = [
  'understanding', 'retrieving', 'planning', 'executing', 'evaluating', 'reflecting', 'storing',
]

const g = globalThis as unknown as {
  __agentRecoveryDone?: boolean
  __agentQueueState?: { chain: Promise<unknown>; running: number; queued: number }
}
const q = (g.__agentQueueState ??= { chain: Promise.resolve(), running: 0, queued: 0 })

export function runnerStats() {
  return { running: q.running, queued: q.queued, maxQueueDepth: MAX_QUEUE_DEPTH, maxConcurrent: 1 }
}

export class QueueFullError extends Error {
  constructor() {
    super('Agent queue is full — too many pending tasks. Try again shortly.')
    this.name = 'QueueFullError'
  }
}

export interface EnqueueOptions {
  mode?: AgentMode
  benchmarkRunId?: string
  /** skip queue depth check (used by the benchmark runner itself) */
  internal?: boolean
  /** test-only injection: replaces the actual agent runner */
  runTask?: (taskId: string, options: { mode?: AgentMode; benchmarkRunId?: string }) => Promise<void>
}

/** Enqueue a task for background execution. Returns immediately. */
export function enqueueTask(taskId: string, options: EnqueueOptions = {}): void {
  if (!options.internal && q.queued + q.running >= MAX_QUEUE_DEPTH) {
    throw new QueueFullError()
  }
  q.queued++
  let started = false
  const run = options.runTask ?? runAgentTask
  // withAgentLock serializes AND maintains the chain (never rejects) itself
  const job = withAgentLock(async () => {
    // the job is now RUNNING: stop counting it as queued so runnerStats
    // never double-counts a task in both `queued` and `running`
    started = true
    q.queued--
    await run(taskId, { mode: options.mode, benchmarkRunId: options.benchmarkRunId })
  })
  job
    .catch((e) => {
      logger.error('runner:job-crashed', { taskId, error: (e as Error).message })
    })
    .finally(() => {
      // defensive: if the job somehow never started, release the queued slot
      // exactly once (withAgentLock always runs fn, so this is belt-and-braces)
      if (!started) q.queued--
    })
  logger.info('runner:enqueued', { taskId, mode: options.mode, queued: q.queued, running: q.running })
}

/**
 * The single agent mutex: everything that runs agent tasks (user queue AND
 * benchmark) goes through here so we never hammer the LLM API in parallel.
 */
export function withAgentLock<T>(fn: () => Promise<T>): Promise<T> {
  const job = q.chain.then(async () => {
    q.running++
    try {
      return await fn()
    } finally {
      q.running--
    }
  })
  // keep the chain alive even if this job fails
  q.chain = job.then(
    () => undefined,
    () => undefined,
  )
  return job
}

/**
 * Await the queue draining (used by tests and graceful shutdown checks).
 */
export async function drainQueue(timeoutMs = 120_000): Promise<void> {
  const start = Date.now()
  while (true) {
    // idle = the chain has settled and nothing is running or queued
    const settled = await Promise.race([
      q.chain.then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 500)),
    ])
    if (settled && q.running === 0 && q.queued === 0) return
    if (Date.now() - start > timeoutMs) throw new Error('Queue drain timed out')
    await new Promise((r) => setTimeout(r, 300))
  }
}

// ---------------------------------------------------------------------------
// Restart recovery (runs once per process)
// ---------------------------------------------------------------------------

/** Test hook: allow recovery to run again in the same process. */
export function __resetRecoveryForTests(): void {
  g.__agentRecoveryDone = false
}

/**
 * Reconcile task rows with the (empty, fresh) in-memory queue after a
 * process restart. Idempotent per process.
 */
export async function recoverOrphanedTasks(
  runTask?: EnqueueOptions['runTask'],
): Promise<void> {
  if (g.__agentRecoveryDone) return
  g.__agentRecoveryDone = true
  try {
    // 1. tasks that had started but never reached a terminal state are dead:
    //    their in-flight queue entry is gone. Mark failed — do NOT auto re-run
    //    (tool side effects may already have happened).
    const interrupted = await db.task.updateMany({
      where: { status: { in: IN_FLIGHT_STATUSES } },
      data: {
        status: 'failed',
        error: 'Task was interrupted by a server restart before completing. Resubmit to re-run it.',
        completedAt: new Date(),
      },
    })
    // 2. tasks that never started are safe to re-enqueue (no side effects yet)
    const pending = await db.task.findMany({
      where: { status: 'pending' },
      select: { id: true, mode: true },
      take: 50,
    })
    for (const t of pending) {
      enqueueTask(t.id, { mode: (t.mode as AgentMode) ?? 'full', internal: true, runTask })
    }
    if (interrupted.count > 0 || pending.length > 0) {
      logger.info('runner:recovered', {
        interrupted: interrupted.count,
        requeued: pending.length,
      })
    }
  } catch (e) {
    logger.error('runner:recovery-failed', { error: (e as Error).message })
  }
}

export async function createAndEnqueueTask(input: {
  title?: string
  input: string
  checks?: unknown
  mode?: AgentMode
}): Promise<{ id: string; queued: number }> {
  const task = await db.task.create({
    data: {
      title: (input.title ?? input.input.slice(0, 80)),
      input: input.input,
      checks: input.checks ? JSON.stringify(input.checks) : null,
      mode: input.mode ?? 'full',
    },
  })
  enqueueTask(task.id, { mode: input.mode })
  return { id: task.id, queued: q.queued + q.running }
}
