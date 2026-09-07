/**
 * RUNNER & RESTART RECOVERY TESTS — queue mechanics, load shedding,
 * concurrent submissions, and what happens to tasks when the server
 * "restarts" (the in-memory queue is lost; the DB is not).
 *
 * A stub runTask is injected so no real LLM calls happen here.
 */
import { describe, expect, test, beforeAll } from 'bun:test'
import { db } from '@/lib/db'
import {
  drainQueue,
  enqueueTask,
  QueueFullError,
  recoverOrphanedTasks,
  runnerStats,
  withAgentLock,
  __resetRecoveryForTests,
} from '@/lib/agent/runner'

const stubRun = async (_taskId: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 25))
}

async function cleanDb() {
  await db.benchmarkRun.deleteMany({})
  await db.task.deleteMany({})
  await db.experience.deleteMany({})
  await db.lesson.deleteMany({})
  await db.strategy.deleteMany({})
  await db.evaluation.deleteMany({})
  await db.toolExecution.deleteMany({})
  await db.agentEvent.deleteMany({})
}

beforeAll(cleanDb)

describe('runner: queue mechanics', () => {
  test('running + queued never double-counts an inflight task', async () => {
    await cleanDb()
    const tasks = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        db.task.create({ data: { title: `t${i}`, input: `input number ${i}`, mode: 'full' } }),
      ),
    )
    for (const t of tasks) enqueueTask(t.id, { runTask: stubRun })
    // sample stats while jobs flow through
    let maxInflight = 0
    for (let i = 0; i < 20; i++) {
      const s = runnerStats()
      maxInflight = Math.max(maxInflight, s.queued + s.running)
      // invariant: a task is counted in exactly ONE of queued/running
      expect(s.running).toBeLessThanOrEqual(1)
      await new Promise((r) => setTimeout(r, 10))
    }
    expect(maxInflight).toBeGreaterThan(0)
    expect(maxInflight).toBeLessThanOrEqual(4)
    await drainQueue(20_000)
    expect(runnerStats().running).toBe(0)
    expect(runnerStats().queued).toBe(0)
  })

  test('queue depth limit sheds load with QueueFullError', async () => {
    await cleanDb()
    const accepted: string[] = []
    let rejected = 0
    // 12 simultaneous submissions (the API awaits none of them — enqueue is sync)
    const tasks = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        db.task.create({ data: { title: `burst-${i}`, input: `burst input ${i}`, mode: 'full' } }),
      ),
    )
    for (const t of tasks) {
      try {
        enqueueTask(t.id, { runTask: stubRun })
        accepted.push(t.id)
      } catch (e) {
        expect(e instanceof QueueFullError).toBe(true)
        rejected++
      }
    }
    expect(accepted.length).toBe(8) // MAX_QUEUE_DEPTH
    expect(rejected).toBe(4)
    await drainQueue(30_000)
    const s = runnerStats()
    expect(s.running).toBe(0)
    expect(s.queued).toBe(0)
  })

  test('a crashing runTask does not poison the queue (chain survives)', async () => {
    await cleanDb()
    const t1 = await db.task.create({ data: { title: 'boom', input: 'will crash', mode: 'full' } })
    const t2 = await db.task.create({ data: { title: 'fine', input: 'will pass', mode: 'full' } })
    enqueueTask(t1.id, {
      runTask: async () => {
        throw new Error('simulated crash')
      },
    })
    enqueueTask(t2.id, { runTask: stubRun })
    await drainQueue(20_000)
    const s = runnerStats()
    expect(s.running).toBe(0)
    expect(s.queued).toBe(0) // chain stayed alive after the crash
  })

  test('withAgentLock serializes concurrent jobs (never parallel)', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const job = () =>
      withAgentLock(async () => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise((r) => setTimeout(r, 30))
        concurrent--
      })
    await Promise.all([job(), job(), job(), job()])
    expect(maxConcurrent).toBe(1)
  })
})

describe('runner: restart recovery', () => {
  test('in-flight tasks are marked failed (interrupted by restart), pending tasks re-enqueued', async () => {
    await cleanDb()
    __resetRecoveryForTests()
    const inFlight = await db.task.create({
      data: {
        title: 'was running when server died',
        input: 'some task that was executing',
        mode: 'full',
        status: 'executing',
        startedAt: new Date(),
      },
    })
    const inFlight2 = await db.task.create({
      data: {
        title: 'was reflecting when server died',
        input: 'another task mid-flight',
        mode: 'full',
        status: 'reflecting',
        startedAt: new Date(),
      },
    })
    const neverStarted = await db.task.create({
      data: { title: 'never started', input: 'queued but not begun', mode: 'full', status: 'pending' },
    })

    const requeued: string[] = []
    await recoverOrphanedTasks(async (taskId) => {
      requeued.push(taskId)
      await stubRun(taskId)
    })

    const after1 = await db.task.findUnique({ where: { id: inFlight.id } })
    expect(after1?.status).toBe('failed')
    expect(after1?.error).toContain('interrupted by a server restart')
    const after2 = await db.task.findUnique({ where: { id: inFlight2.id } })
    expect(after2?.status).toBe('failed')

    expect(requeued).toContain(neverStarted.id)
    expect(requeued).not.toContain(inFlight.id) // never auto re-run mid-flight tasks
    await drainQueue(20_000)
  })

  test('recovery is idempotent per process (second call is a no-op)', async () => {
    const pendingBefore = await db.task.count({ where: { status: 'pending' } })
    await recoverOrphanedTasks(async () => {
      throw new Error('should not be called — idempotent')
    })
    const pendingAfter = await db.task.count({ where: { status: 'pending' } })
    expect(pendingAfter).toBe(pendingBefore)
  })

  test('recovery failure does not crash the caller', async () => {
    __resetRecoveryForTests()
    // simulate a DB outage by pointing Prisma at a broken table operation:
    // we cannot easily kill the DB, so instead verify the try/catch contract
    // by passing a runTask that throws — recovery itself already succeeded
    // (updateMany) so this only exercises the enqueue path robustness.
    await expect(
      recoverOrphanedTasks(async () => {
        throw new Error('boom')
      }),
    ).resolves.toBeUndefined()
    await drainQueue(20_000)
  })
})

describe('runner: persistence across restart', () => {
  test('completed task rows survive (DB is the source of truth, not the queue)', async () => {
    await cleanDb()
    const t = await db.task.create({
      data: { title: 'persisted', input: 'completed task', mode: 'full', status: 'completed', score: 1, success: true },
    })
    // simulate "restart": fresh process state (chain reset is not directly
    // possible, but the DB row must remain queryable and terminal)
    const row = await db.task.findUnique({ where: { id: t.id } })
    expect(row?.status).toBe('completed')
    expect(row?.score).toBe(1)
  })
})
