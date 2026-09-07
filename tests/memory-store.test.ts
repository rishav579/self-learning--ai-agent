import { describe, expect, test, beforeAll } from 'bun:test'
import { db } from '@/lib/db'
import { retrieveRelevantMemory } from '@/lib/agent/memory/retrieval'
import {
  storeExperience,
  storeLesson,
  recordLessonUsage,
  updateStrategyStats,
  rankStrategies,
} from '@/lib/agent/memory/store'
import type { Reflection } from '@/lib/agent/types'

async function cleanDb() {
  await db.task.deleteMany({})
  await db.experience.deleteMany({})
  await db.lesson.deleteMany({})
  await db.strategy.deleteMany({})
  await db.evaluation.deleteMany({})
  await db.toolExecution.deleteMany({})
  await db.agentEvent.deleteMany({})
}

beforeAll(cleanDb)

describe('memory store + retrieval round trip', () => {
  test('stores an experience and retrieves it for a similar task', async () => {
    const task = await db.task.create({
      data: { title: 't1', input: 'Compute 8347 * 2953 and report the exact integer result.', mode: 'full' },
    })
    await storeExperience({
      taskId: task.id,
      taskSummary: 'Compute a hard multiplication exactly',
      category: 'arithmetic',
      context: 'mode=full',
      actionsSummary: ['calculator({"expression":"8347 * 2953"})'],
      outcome: 'success',
      score: 1,
      success: true,
      successfulApproach: 'use calculator',
      strategyName: 'tool-first-arithmetic',
      keywords: ['compute', 'multiplication', 'exact'],
    })

    const memory = await retrieveRelevantMemory(
      'Compute 7261 * 4018 and report the exact integer result.',
      'arithmetic',
    )
    expect(memory.experiences.length).toBeGreaterThan(0)
    expect(memory.experiences[0].summary).toContain('multiplication')
    expect(memory.experiences[0].success).toBe(true)
  })

  test('irrelevant tasks do not flood retrieval (threshold)', async () => {
    const memory = await retrieveRelevantMemory('Read the notes file in the sandbox and report the environment', 'file_reading')
    // no file_reading experience was stored → nothing relevant
    expect(memory.experiences.filter((e) => e.summary.includes('multiplication'))).toHaveLength(0)
  })

  test('lessons are retrieved and usage stats tracked', async () => {
    const task = await db.task.create({ data: { title: 't2', input: 'Compute 111 * 222', mode: 'full' } })
    const reflection: Reflection = {
      whatWorked: 'calculator',
      whatFailed: 'mental math',
      rootCause: 'llm arithmetic',
      doDifferently: 'always use calculator',
      lesson: {
        content: 'For multiplication tasks always use the calculator tool — mental arithmetic produced a wrong answer.',
        type: 'failure',
        confidence: 0.9,
        strategyName: 'tool-first-arithmetic',
        keywords: ['multiplication', 'calculator', 'compute'],
      },
    }
    const stored = await storeLesson(reflection, 'arithmetic', task.id)
    expect(stored.deduplicated).toBe(false)

    const memory = await retrieveRelevantMemory('Compute 999 * 888 and report the exact result', 'arithmetic')
    expect(memory.lessons.length).toBeGreaterThan(0)
    expect(memory.lessonIds).toContain(stored.lessonId)

    // a follow-up task succeeds using it → lesson marked helpful
    await recordLessonUsage(memory.lessonIds, 1.0, true)
    const lesson = await db.lesson.findUnique({ where: { id: stored.lessonId } })
    expect(lesson?.useCount).toBe(1)
    expect(lesson?.helpfulCount).toBe(1)
  })

  test('near-duplicate lessons are merged (dedup), not duplicated', async () => {
    const before = await db.lesson.count({ where: { category: 'arithmetic' } })
    const task = await db.task.create({ data: { title: 't3', input: 'Compute 333 * 444', mode: 'full' } })
    const reflection: Reflection = {
      ...({
        whatWorked: 'calculator',
        whatFailed: 'mental math',
        rootCause: 'llm arithmetic',
        doDifferently: 'always use the calculator',
      } as object) as Reflection,
      lesson: {
        content: 'Always use the calculator tool for multiplication tasks — mental arithmetic gives wrong answers.',
        type: 'failure',
        confidence: 0.85,
        strategyName: 'tool-first-arithmetic',
        keywords: ['multiplication', 'calculator'],
      },
    } as Reflection
    const stored = await storeLesson(reflection, 'arithmetic', task.id)
    const after = await db.lesson.count({ where: { category: 'arithmetic' } })
    expect(stored.deduplicated).toBe(true)
    expect(after).toBe(before) // no new row
    const lesson = await db.lesson.findUnique({ where: { id: stored.lessonId } })
    expect(lesson && lesson.refinements >= 1).toBe(true)
  })

  test('strategy stats accumulate and rank correctly', async () => {
    await updateStrategyStats('tool-first-arithmetic', 'arithmetic', 'Use tools before mental work', 1.0, true)
    await updateStrategyStats('tool-first-arithmetic', 'arithmetic', 'Use tools before mental work', 1.0, true)
    await updateStrategyStats('mental-math', 'arithmetic', 'Try to compute mentally', 0.1, false)

    const ranked = await rankStrategies('arithmetic')
    expect(ranked[0].name).toBe('tool-first-arithmetic')
    const mental = ranked.find((s) => s.name === 'mental-math')
    expect(mental).toBeDefined()
    expect(mental!.uses).toBe(1)
    expect(mental!.successes).toBe(0)
    // Laplace smoothing keeps a single failure from being a hard 0
    expect(mental!.successRate).toBeGreaterThan(0)
    expect(mental!.successRate).toBeLessThan(ranked[0].successRate)
  })

  test('rankStrategies does not leak other categories', async () => {
    await updateStrategyStats('file-scout', 'file_reading', 'list files first', 1.0, true)
    const ranked = await rankStrategies('arithmetic')
    expect(ranked.find((s) => s.name === 'file-scout')).toBeUndefined()
  })
})
