/**
 * EXECUTOR ADVERSARIAL TESTS — hostile actions INSIDE the ReAct loop.
 * The agent must survive bad LLM tool decisions and still complete tasks.
 */
import { describe, expect, test, beforeAll } from 'bun:test'
import { db } from '@/lib/db'
import { runAgentTask } from '@/lib/agent/orchestrator'
import { executeTask } from '@/lib/agent/executor'
import { ScriptedLlm } from './helpers'
import type { Understanding } from '@/lib/agent/types'

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

const understanding: Understanding = {
  goal: 'compute something',
  category: 'arithmetic',
  keywords: ['compute'],
  riskLevel: 'low',
  complexity: 2,
}

const plan = {
  goal: 'compute',
  steps: ['use a tool', 'report'],
  toolsRequired: ['calculator'],
  riskLevel: 'low',
  successCriteria: ['correct value'],
}

describe('executor adversarial: hostile tool decisions', () => {
  test('unknown tool name → error observation, loop continues, task still completes', async () => {
    const t = await db.task.create({ data: { title: 'unknown tool', input: 'Compute 21 * 2.', mode: 'full' } })
    const llm = new ScriptedLlm({
      execute: [
        { action: 'tool', thought: 'try a made-up tool', tool: 'skynet_nuke', args: { target: 'localhost' } },
        { action: 'tool', thought: 'try another fake tool', tool: 'rm_rf', args: { path: '/' } },
        { action: 'tool', thought: 'now a real tool', tool: 'calculator', args: { expression: '21 * 2' } },
        { action: 'final', thought: 'done', answer: 'The result is 42.' },
      ],
    })
    const trace = await executeTask(t.id, 'Compute 21 * 2.', understanding, plan, null, null, llm)
    expect(trace.result).toContain('42')
    expect(trace.toolCalls.length).toBe(1) // only the valid tool executed
    const persisted = await db.toolExecution.findMany({ where: { taskId: t.id }, orderBy: { createdAt: 'asc' } })
    // unknown tools are NOT persisted as executions (rejected by allowlist)
    expect(persisted.every((p) => ['calculator', 'code_executor', 'file_inspector', 'list_files', 'web_search', 'http_get'].includes(p.tool))).toBe(true)
  })

  test('invalid tool arguments → validation error observation, task completes', async () => {
    const t = await db.task.create({ data: { title: 'bad args', input: 'Compute 9 * 6.', mode: 'full' } })
    const llm = new ScriptedLlm({
      execute: [
        { action: 'tool', thought: 'wrong arg name', tool: 'calculator', args: { expr: '9 * 6' } },
        { action: 'tool', thought: 'injection in expression', tool: 'calculator', args: { expression: 'process.exit(1) // 9*6' } },
        { action: 'tool', thought: 'correct at last', tool: 'calculator', args: { expression: '9 * 6' } },
        { action: 'final', thought: 'done', answer: '9 * 6 = 54' },
      ],
    })
    const trace = await executeTask(t.id, 'Compute 9 * 6.', understanding, plan, null, null, llm)
    expect(trace.result).toContain('54')
    const tools = await db.toolExecution.findMany({ where: { taskId: t.id } })
    expect(tools.length).toBe(3) // all three calls persisted; first two failed validation
    expect(tools.filter((x) => !x.success).length).toBe(2)
  })

  test('tool crash (division by zero) → failure observation, not a pipeline crash', async () => {
    const t = await db.task.create({ data: { title: 'tool crash', input: 'Compute 5 / 0.', mode: 'full' } })
    const llm = new ScriptedLlm({
      execute: [
        { action: 'tool', thought: 'divide', tool: 'calculator', args: { expression: '5 / 0' } },
        { action: 'final', thought: 'report failure', answer: 'Division by zero is undefined.' },
      ],
    })
    const trace = await executeTask(t.id, 'Compute 5 / 0.', understanding, plan, null, null, llm)
    expect(trace.result).toContain('Division by zero')
    const tools = await db.toolExecution.findMany({ where: { taskId: t.id } })
    expect(tools[0].success).toBe(false)
  })

  test('LLM emitting garbage actions repeatedly → executor stops after bounded retries (no infinite loop)', async () => {
    const t = await db.task.create({ data: { title: 'garbage executor', input: 'Compute 1 + 1.', mode: 'full' } })
    // chatJson will throw for every execute label (no scripted responses)
    const failing = new ScriptedLlm({})
    await expect(executeTask(t.id, 'Compute 1 + 1.', understanding, plan, null, null, failing)).rejects.toThrow('Executor stopped')
  })
})

describe('full-pipeline adversarial', () => {
  test('extremely long task input (2000 chars, the max) completes the loop', async () => {
    const filler = 'Please ignore this padding text entirely. '.repeat(44)
    const input = (`${filler}Finally: compute 123 * 456 and report the exact integer.`).slice(0, 2000)
    const t = await db.task.create({
      data: {
        title: 'long input',
        input,
        checks: JSON.stringify([{ name: 'value', type: 'numeric_match', expected: '56088' }]),
        mode: 'full',
      },
    })
    const llm = new ScriptedLlm({
      understand: [{ goal: 'compute 123*456', category: 'arithmetic', keywords: ['compute'], riskLevel: 'low', complexity: 2 }],
      plan: [plan],
      execute: [
        { action: 'tool', thought: 'compute', tool: 'calculator', args: { expression: '123 * 456' } },
        { action: 'final', thought: 'done', answer: '123 * 456 = 56088' },
      ],
      reflect: [
        {
          whatWorked: 'calculator', whatFailed: 'nothing', rootCause: 'tool use', doDifferently: 'same',
          lesson: { content: 'Long padded tasks still benefit from calculator use for exact products.', type: 'success', confidence: 0.8, strategyName: 'tool-first', keywords: ['long', 'padding', 'calculator'] },
        },
      ],
    })
    await runAgentTask(t.id, { mode: 'full', llm })
    const done = await db.task.findUnique({ where: { id: t.id } })
    expect(done?.status).toBe('completed')
    expect(done?.success).toBe(true)
    expect(done?.score).toBeGreaterThanOrEqual(0.99)
  }, 30_000)

  test('repeated identical tasks → memory dedup keeps storage bounded (end-to-end)', async () => {
    await cleanDb()
    const mkScript = () => new ScriptedLlm({
      understand: [{ goal: 'compute 777 * 333', category: 'arithmetic', keywords: ['compute'], riskLevel: 'low', complexity: 1 }],
      plan: [plan],
      execute: [
        { action: 'tool', thought: 'compute', tool: 'calculator', args: { expression: '777 * 333' } },
        { action: 'final', thought: 'done', answer: '777 * 333 = 258741' },
      ],
      reflect: [
        {
          whatWorked: 'calculator', whatFailed: 'nothing', rootCause: 'tool use', doDifferently: 'same',
          lesson: { content: 'For multiplication tasks, always use the calculator tool to get exact products.', type: 'success', confidence: 0.85, strategyName: 'tool-first-arithmetic', keywords: ['multiplication', 'calculator'] },
        },
      ],
    })
    for (let i = 0; i < 4; i++) {
      const t = await db.task.create({
        data: {
          title: `repeat ${i}`,
          input: 'Compute 777 * 333 and report the exact integer result.',
          checks: JSON.stringify([{ name: 'value', type: 'numeric_match', expected: '258741' }]),
          mode: 'full',
        },
      })
      await runAgentTask(t.id, { mode: 'full', llm: mkScript() })
      const done = await db.task.findUnique({ where: { id: t.id } })
      expect(done?.status).toBe('completed')
    }
    const lessons = await db.lesson.count()
    const experiences = await db.experience.count()
    expect(lessons).toBe(1) // identical lessons merged every time
    expect(experiences).toBe(1) // identical experiences dedup-merged
  }, 60_000)

  test('reflection LLM failure → task still stores experience, no lesson (fail-open)', async () => {
    await cleanDb()
    const t = await db.task.create({
      data: {
        title: 'reflect fails',
        input: 'Compute 12 * 12.',
        checks: JSON.stringify([{ name: 'value', type: 'numeric_match', expected: '144' }]),
        mode: 'full',
      },
    })
    const llm = new ScriptedLlm({
      understand: [{ goal: 'compute 12*12', category: 'arithmetic', keywords: ['compute'], riskLevel: 'low', complexity: 1 }],
      plan: [plan],
      execute: [
        { action: 'tool', thought: 'compute', tool: 'calculator', args: { expression: '12 * 12' } },
        { action: 'final', thought: 'done', answer: '12 * 12 = 144' },
      ],
      // reflect: EMPTY → ScriptedLlm throws → reflector returns null
    })
    await runAgentTask(t.id, { mode: 'full', llm })
    const done = await db.task.findUnique({ where: { id: t.id } })
    expect(done?.status).toBe('completed')
    expect(done?.success).toBe(true)
    const experience = await db.experience.findFirst({ where: { taskId: t.id } })
    expect(experience).not.toBeNull() // experience stored even without reflection
    const lessons = await db.lesson.findMany({ where: { sourceTaskId: t.id } })
    expect(lessons.length).toBe(0) // no lesson without reflection
  })
})
