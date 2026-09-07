import { describe, expect, test } from 'bun:test'
import {
  UnderstandingSchema,
  PlanSchema,
  ExecutorActionSchema,
  ReflectionSchema,
  SubjectiveEvaluationSchema,
  CreateTaskSchema,
  RunBenchmarkSchema,
} from '@/lib/agent/schemas'

describe('schema validation of LLM output', () => {
  test('accepts a valid understanding', () => {
    const r = UnderstandingSchema.safeParse({
      goal: 'Multiply two numbers',
      category: 'arithmetic',
      keywords: ['multiply', 'numbers', 'exact'],
      riskLevel: 'low',
      complexity: 2,
    })
    expect(r.success).toBe(true)
  })

  test('rejects garbage understanding', () => {
    const r = UnderstandingSchema.safeParse({ goal: '', keywords: 'not-an-array' })
    expect(r.success).toBe(false)
  })

  test('plan requires at least one step', () => {
    expect(PlanSchema.safeParse({ goal: 'g', steps: ['a'] }).success).toBe(true)
    expect(PlanSchema.safeParse({ goal: 'g', steps: [] }).success).toBe(false)
    expect(PlanSchema.safeParse({ goal: 'g', steps: Array(12).fill('step') }).success).toBe(false)
  })

  test('executor action: tool variant', () => {
    const r = ExecutorActionSchema.safeParse({
      action: 'tool',
      thought: 'need exact math',
      tool: 'calculator',
      args: { expression: '2+2' },
    })
    expect(r.success).toBe(true)
  })

  test('executor action: rejects unknown tool-shaped payloads missing fields', () => {
    expect(ExecutorActionSchema.safeParse({ action: 'tool', tool: 'calculator' }).success).toBe(false)
    expect(ExecutorActionSchema.safeParse({ action: 'run', command: 'rm -rf /' }).success).toBe(false)
    expect(ExecutorActionSchema.safeParse({ action: 'final' }).success).toBe(false)
  })

  test('executor action: final variant', () => {
    const r = ExecutorActionSchema.safeParse({ action: 'final', thought: 'done', answer: '42' })
    expect(r.success).toBe(true)
  })

  test('reflection clamps out-of-range confidence via defensive catch', () => {
    const r = ReflectionSchema.safeParse({
      whatWorked: 'calculator',
      whatFailed: 'mental math',
      rootCause: 'arithmetic error',
      doDifferently: 'use tools',
      lesson: {
        content: 'Always use calculator for multiplication',
        type: 'failure',
        confidence: 9, // out of range → defensively caught and clamped to 0.5
        strategyName: 'tool-first-arithmetic',
        keywords: ['calculator', 'multiplication'],
      },
    })
    // lenient-by-design: bad confidence falls back to a neutral 0.5
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.lesson.confidence).toBe(0.5)
    }
  })

  test('subjective evaluation bounds', () => {
    expect(SubjectiveEvaluationSchema.safeParse({ score: 0.8, success: true, summary: 'ok' }).success).toBe(true)
    expect(SubjectiveEvaluationSchema.safeParse({ score: 2, success: true, summary: 'ok' }).success).toBe(false)
    expect(SubjectiveEvaluationSchema.safeParse({ score: -1, summary: 'no' }).success).toBe(false)
  })
})

describe('API input validation', () => {
  test('create task happy path', () => {
    const r = CreateTaskSchema.safeParse({
      input: 'Compute 2+2',
      checks: [{ name: 'exact', type: 'numeric_match', expected: '4' }],
    })
    expect(r.success).toBe(true)
  })

  test('create task rejects empty and oversized input', () => {
    expect(CreateTaskSchema.safeParse({ input: '' }).success).toBe(false)
    expect(CreateTaskSchema.safeParse({ input: 'x'.repeat(3000) }).success).toBe(false)
  })

  test('create task rejects bad check type and >5 checks', () => {
    expect(
      CreateTaskSchema.safeParse({ input: 'task', checks: [{ name: 'x', type: 'exec_shell', expected: 'ls' }] }).success,
    ).toBe(false)
    expect(
      CreateTaskSchema.safeParse({
        input: 'task',
        checks: Array(6).fill({ name: 'x', type: 'output_contains', expected: 'y' }),
      }).success,
    ).toBe(false)
  })

  test('create task rejects invalid mode', () => {
    expect(CreateTaskSchema.safeParse({ input: 'task', mode: 'turbo' }).success).toBe(false)
  })

  test('benchmark schema', () => {
    expect(RunBenchmarkSchema.safeParse({}).success).toBe(true)
    expect(RunBenchmarkSchema.safeParse({ taskSet: 'quick', modes: ['full'] }).success).toBe(true)
    expect(RunBenchmarkSchema.safeParse({ modes: [] }).success).toBe(false)
  })
})
