/**
 * Task runner: serializes agent runs through a single in-process queue
 * (one agent at a time — protects the LLM budget and SQLite writes) and
 * enforces queue-depth limits so the API can shed load.
 */
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { runAgentTask } from './orchestrator'
import type { AgentMode } from './types'

const MAX_QUEUE_DEPTH = 8

let chain: Promise<unknown> = Promise.resolve()
let running = 0
let queued = 0

export function runnerStats() {
  return { running, queued, maxQueueDepth: MAX_QUEUE_DEPTH, maxConcurrent: 1 }
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
}

/** Enqueue a task for background execution. Returns immediately. */
export function enqueueTask(taskId: string, options: EnqueueOptions = {}): void {
  if (!options.internal && queued >= MAX_QUEUE_DEPTH) {
    throw new QueueFullError()
  }
  queued++
  // withAgentLock serializes AND maintains the chain (never rejects) itself
  const job = withAgentLock(async () => {
    await runAgentTask(taskId, { mode: options.mode, benchmarkRunId: options.benchmarkRunId })
  })
  job
    .catch((e) => {
      logger.error('runner:job-crashed', { taskId, error: (e as Error).message })
    })
    .finally(() => {
      queued--
    })
  logger.info('runner:enqueued', { taskId, mode: options.mode, queued, running })
}

/**
 * The single agent mutex: everything that runs agent tasks (user queue AND
 * benchmark) goes through here so we never hammer the LLM API in parallel.
 */
export function withAgentLock<T>(fn: () => Promise<T>): Promise<T> {
  const job = chain.then(async () => {
    running++
    try {
      return await fn()
    } finally {
      running--
    }
  })
  // keep the chain alive even if this job fails
  chain = job.then(
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
      chain.then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 500)),
    ])
    if (settled && running === 0 && queued === 0) return
    if (Date.now() - start > timeoutMs) throw new Error('Queue drain timed out')
    await new Promise((r) => setTimeout(r, 300))
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
  return { id: task.id, queued: queued + running }
}
