/**
 * FULL LEARNING LOOP integration test with a scripted (mocked) LLM.
 * Verifies deterministically, with no network:
 *   task 1 → understand → (no memory) → plan → tool call → evaluate →
 *   reflect → lesson stored → experience stored → strategy updated
 *   task 2 (similar) → memory retrieved (lesson visible!) → completes
 * Also verifies a failure case stores a failure lesson.
 */
import { describe, expect, test, beforeAll } from 'bun:test'
import { db } from '@/lib/db'
import { runAgentTask } from '@/lib/agent/orchestrator'
import { ScriptedLlm } from './helpers'

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

describe('full agent loop (mocked LLM)', () => {
  test('task 1: cold start, tool use, objective evaluation, lesson stored', async () => {
    const task = await db.task.create({
      data: {
        title: 'Arithmetic #1',
        input: 'Compute 8347 * 2953 and report the exact integer result.',
        checks: JSON.stringify([
          { name: 'exact product', type: 'numeric_match', expected: '24648691' },
          { name: 'used calculator', type: 'tool_succeeded', expected: 'calculator', weight: 0.2 },
        ]),
        mode: 'full',
      },
    })

    const llm = new ScriptedLlm({
      understand: [
        {
          goal: 'Compute the product of 8347 and 2953 exactly',
          category: 'arithmetic',
          keywords: ['compute', 'multiplication', 'exact', 'integer'],
          riskLevel: 'low',
          complexity: 2,
        },
      ],
      plan: [
        {
          goal: 'Compute exact product',
          steps: ['Use the calculator tool to compute 8347 * 2953', 'Report the result'],
          toolsRequired: ['calculator'],
          riskLevel: 'low',
          successCriteria: ['Result equals the exact product'],
        },
      ],
      execute: [
        { action: 'tool', thought: 'need exact arithmetic', tool: 'calculator', args: { expression: '8347 * 2953' } },
        { action: 'final', thought: 'done', answer: '8347 * 2953 = 24648691' },
      ],
      reflect: [
        {
          whatWorked: 'calculator gave the exact product',
          whatFailed: 'nothing',
          rootCause: 'tool use avoided arithmetic error',
          doDifferently: 'keep using calculator for multiplication',
          lesson: {
            content: 'For multiplication tasks use the calculator tool to get exact products.',
            type: 'success',
            confidence: 0.9,
            strategyName: 'tool-first-arithmetic',
            keywords: ['multiplication', 'calculator', 'compute'],
          },
        },
      ],
    })

    await runAgentTask(task.id, { mode: 'full', llm })

    const done = await db.task.findUnique({ where: { id: task.id } })
    expect(done?.status).toBe('completed')
    expect(done?.success).toBe(true)
    expect(done?.score).toBeGreaterThanOrEqual(0.99)
    expect(done?.result).toContain('24648691')
    expect(done?.iterations).toBe(2)

    // objective evaluation row exists and marked objective
    const evaluation = await db.evaluation.findUnique({ where: { taskId: task.id } })
    expect(evaluation?.objective).toBe(true)
    expect(evaluation?.success).toBe(true)

    // tool execution logged
    const tools = await db.toolExecution.findMany({ where: { taskId: task.id } })
    expect(tools.length).toBe(1)
    expect(tools[0].tool).toBe('calculator')
    expect(tools[0].success).toBe(true)

    // lesson stored
    const lessons = await db.lesson.findMany({ where: { sourceTaskId: task.id } })
    expect(lessons.length).toBe(1)
    expect(lessons[0].content).toContain('calculator')

    // experience stored and linked to the lesson
    const experience = await db.experience.findFirst({ where: { taskId: task.id } })
    expect(experience?.success).toBe(true)
    expect(experience?.lessonId).toBe(lessons[0].id)

    // strategy stats updated
    const strategy = await db.strategy.findUnique({ where: { name: 'tool-first-arithmetic' } })
    expect(strategy?.uses).toBe(1)
    expect(strategy?.successes).toBe(1)

    // event timeline contains every phase
    const events = await db.agentEvent.findMany({ where: { taskId: task.id }, orderBy: { createdAt: 'asc' } })
    const types = events.map((e) => e.type)
    for (const expected of [
      'task_started',
      'understanding',
      'memory_retrieved',
      'plan_created',
      'iteration',
      'evaluation',
      'reflection',
      'lesson_stored',
      'experience_stored',
      'strategy_updated',
      'task_completed',
    ]) {
      expect(types).toContain(expected)
    }
  })

  test('task 2: similar task RETRIEVES the lesson from task 1', async () => {
    const task = await db.task.create({
      data: {
        title: 'Arithmetic #2',
        input: 'Compute 7261 * 4018 and report the exact integer result.',
        checks: JSON.stringify([{ name: 'exact product', type: 'numeric_match', expected: '29174698' }]),
        mode: 'full',
      },
    })

    const llm = new ScriptedLlm({
      understand: [
        {
          goal: 'Compute product of 7261 and 4018',
          category: 'arithmetic',
          keywords: ['compute', 'multiplication', 'exact'],
          riskLevel: 'low',
          complexity: 2,
        },
      ],
      plan: [
        {
          goal: 'Compute exact product',
          steps: ['Use calculator (per lesson)', 'Report'],
          toolsRequired: ['calculator'],
          riskLevel: 'low',
          successCriteria: ['exact'],
        },
      ],
      execute: [
        { action: 'tool', thought: 'applying lesson: use calculator', tool: 'calculator', args: { expression: '7261 * 4018' } },
        { action: 'final', thought: 'done', answer: '7261 * 4018 = 29174698' },
      ],
      reflect: [
        {
          whatWorked: 'applied prior lesson',
          whatFailed: 'none',
          rootCause: 'memory-guided tool choice',
          doDifferently: 'continue',
          lesson: {
            content: 'Calculator usage remains reliable for exact multiplication tasks.',
            type: 'success',
            confidence: 0.95,
            strategyName: 'tool-first-arithmetic',
            keywords: ['multiplication', 'calculator'],
          },
        },
      ],
    })

    await runAgentTask(task.id, { mode: 'full', llm })

    const done = await db.task.findUnique({ where: { id: task.id } })
    expect(done?.status).toBe('completed')
    expect(done?.success).toBe(true)

    // THE LEARNING LOOP ASSERTATION: memory retrieval actually happened and
    // returned the lesson from task 1
    const retrieved = JSON.parse(done?.retrievedMemory ?? '{}')
    expect(retrieved.lessons.length).toBeGreaterThan(0)
    expect(retrieved.lessons[0].content).toContain('calculator')

    // strategy selected and recorded on the task
    expect(done?.strategyName).toBe('tool-first-arithmetic')

    // the lesson's usage stats were updated by the retrieval
    const priorLesson = await db.lesson.findFirst({ where: { content: { contains: 'exact products' } } })
    expect(priorLesson?.useCount).toBeGreaterThanOrEqual(1)
    expect(priorLesson?.helpfulCount).toBeGreaterThanOrEqual(1)

    // task 2's lesson has meaningfully different content (similarity < 0.72
    // dedup threshold) so it is stored as a second distinct lesson
    const arithmeticLessons = await db.lesson.count({ where: { category: 'arithmetic' } })
    expect(arithmeticLessons).toBe(2)

    // strategy stats now show 2 uses
    const strategy = await db.strategy.findUnique({ where: { name: 'tool-first-arithmetic' } })
    expect(strategy?.uses).toBe(2)
  })

  test('task 3: failure case → failure detected, failure lesson stored', async () => {
    const task = await db.task.create({
      data: {
        title: 'Arithmetic #3 (wrong answer)',
        input: 'Compute 1234 * 5678 and report the exact integer result.',
        checks: JSON.stringify([{ name: 'exact product', type: 'numeric_match', expected: '7006652' }]),
        mode: 'full',
      },
    })

    const llm = new ScriptedLlm({
      understand: [
        {
          goal: 'Compute 1234*5678',
          category: 'arithmetic',
          keywords: ['compute', 'multiplication'],
          riskLevel: 'low',
          complexity: 2,
        },
      ],
      plan: [
        {
          goal: 'compute product',
          steps: ['compute mentally', 'report'],
          toolsRequired: [],
          riskLevel: 'low',
          successCriteria: ['exact'],
        },
      ],
      execute: [{ action: 'final', thought: 'i can do this mentally', answer: '1234 * 5678 = 7000000 (approx)' }],
      reflect: [
        {
          whatWorked: 'nothing',
          whatFailed: 'mental arithmetic gave wrong product',
          rootCause: 'did not use calculator',
          doDifferently: 'always use the calculator tool',
          lesson: {
            content: 'Never multiply large numbers mentally — always call the calculator tool.',
            type: 'failure',
            confidence: 0.95,
            strategyName: 'tool-first-arithmetic',
            keywords: ['multiplication', 'calculator', 'mental'],
          },
        },
      ],
    })

    await runAgentTask(task.id, { mode: 'full', llm })

    const done = await db.task.findUnique({ where: { id: task.id } })
    expect(done?.status).toBe('completed')
    expect(done?.success).toBe(false)
    expect((done?.score ?? 1)).toBeLessThan(1)

    const failureLesson = await db.lesson.findFirst({ where: { sourceTaskId: task.id } })
    expect(failureLesson?.type).toBe('failure')

    // failed run without tool calls → internal check flags it
    const evaluation = await db.evaluation.findUnique({ where: { taskId: task.id } })
    const checks = JSON.parse(evaluation?.checks ?? '[]') as { name: string; passed: boolean }[]
    const exactCheck = checks.find((c) => c.name === 'exact product')
    expect(exactCheck?.passed).toBe(false)
  })

  test('no_memory mode: nothing is stored, nothing retrieved', async () => {
    const task = await db.task.create({
      data: {
        title: 'Arithmetic #4 (no memory mode)',
        input: 'Compute 100 * 100 and report the result.',
        checks: JSON.stringify([{ name: 'exact', type: 'numeric_match', expected: '10000' }]),
        mode: 'no_memory',
      },
    })
    const lessonsBefore = await db.lesson.count({})
    const experiencesBefore = await db.experience.count({})

    const llm = new ScriptedLlm({
      understand: [
        { goal: 'compute', category: 'arithmetic', keywords: ['compute'], riskLevel: 'low', complexity: 1 },
      ],
      plan: [{ goal: 'compute', steps: ['use calculator'], toolsRequired: ['calculator'], riskLevel: 'low', successCriteria: ['exact'] }],
      execute: [
        { action: 'tool', thought: 'compute', tool: 'calculator', args: { expression: '100 * 100' } },
        { action: 'final', thought: 'done', answer: '100 * 100 = 10000' },
      ],
      reflect: [
        {
          whatWorked: 'tool',
          whatFailed: 'none',
          rootCause: '-',
          doDifferently: '-',
          lesson: { content: 'n/a', type: 'success', confidence: 0.5, strategyName: null, keywords: [] },
        },
      ],
    })

    await runAgentTask(task.id, { mode: 'no_memory', llm })
    const done = await db.task.findUnique({ where: { id: task.id } })
    expect(done?.status).toBe('completed')
    expect(done?.success).toBe(true)

    // memory stays untouched
    expect(await db.lesson.count({})).toBe(lessonsBefore)
    expect(await db.experience.count({})).toBe(experiencesBefore)
    expect(done?.retrievedMemory).toBeNull()

    // the retrieve event says skipped
    const evt = await db.agentEvent.findFirst({ where: { taskId: task.id, type: 'memory_retrieved' } })
    const payload = JSON.parse(evt?.payload ?? '{}')
    expect(payload.skipped).toBe(true)
  })
})
