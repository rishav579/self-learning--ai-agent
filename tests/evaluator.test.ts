import { describe, expect, test } from 'bun:test'
import { runCheck, internalChecks, type EvaluationContext } from '@/lib/agent/evaluator'

function ctx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    taskInput: 'test task',
    result: 'The answer is 42.',
    toolExecutions: [{ tool: 'calculator', success: true, error: null }],
    iterations: 3,
    maxIterations: 8,
    iterationExhausted: false,
    ...overrides,
  }
}

describe('objective checks', () => {
  test('output_contains is case-insensitive', () => {
    expect(runCheck({ name: 'c', type: 'output_contains', expected: 'ANSWER' }, ctx()).passed).toBe(true)
    expect(runCheck({ name: 'c', type: 'output_contains', expected: 'elephant' }, ctx()).passed).toBe(false)
  })

  test('numeric_match finds numbers in text', () => {
    expect(runCheck({ name: 'c', type: 'numeric_match', expected: '42' }, ctx()).passed).toBe(true)
    expect(runCheck({ name: 'c', type: 'numeric_match', expected: '43' }, ctx()).passed).toBe(false)
  })

  test('numeric_match respects tolerance', () => {
    expect(runCheck({ name: 'c', type: 'numeric_match', expected: '42.001', tolerance: 0.01 }, ctx()).passed).toBe(true)
    expect(runCheck({ name: 'c', type: 'numeric_match', expected: '42.001', tolerance: 0.0001 }, ctx()).passed).toBe(false)
  })

  test('numeric_match detects wrong mental arithmetic (the real failure mode)', () => {
    // Task: 8347*2953 → correct 24648691, agent's wrong answer 24639091
    const wrong = ctx({ result: '8347 * 2953 = 24639091' })
    expect(runCheck({ name: 'c', type: 'numeric_match', expected: '24648691' }, wrong).passed).toBe(false)
    const right = ctx({ result: '8347 * 2953 = 24648691' })
    expect(runCheck({ name: 'c', type: 'numeric_match', expected: '24648691' }, right).passed).toBe(true)
  })

  test('regex_match works and invalid regex fails safely', () => {
    expect(runCheck({ name: 'c', type: 'regex_match', expected: 'answer.*42' }, ctx()).passed).toBe(true)
    const bad = runCheck({ name: 'c', type: 'regex_match', expected: '(unclosed' }, ctx())
    expect(bad.passed).toBe(false)
    expect(bad.detail).toContain('Invalid regex')
  })

  test('js_expression evaluates with result bound', () => {
    expect(runCheck({ name: 'c', type: 'js_expression', expected: "result.includes('42')" }, ctx()).passed).toBe(true)
    expect(runCheck({ name: 'c', type: 'js_expression', expected: "result.includes('99')" }, ctx()).passed).toBe(false)
    const crash = runCheck({ name: 'c', type: 'js_expression', expected: 'throw new Error("x")' }, ctx())
    expect(crash.passed).toBe(false)
  })

  test('tool_succeeded checks the trace', () => {
    expect(runCheck({ name: 'c', type: 'tool_succeeded', expected: 'calculator' }, ctx()).passed).toBe(true)
    expect(runCheck({ name: 'c', type: 'tool_succeeded', expected: 'web_search' }, ctx()).passed).toBe(false)
  })
})

describe('internal objective checks', () => {
  test('all pass on a healthy run', () => {
    const checks = internalChecks(ctx())
    expect(checks.find((c) => c.name === 'no_tool_failures')?.passed).toBe(true)
    expect(checks.find((c) => c.name === 'produced_result')?.passed).toBe(true)
    expect(checks.find((c) => c.name === 'no_iteration_exhaustion')?.passed).toBe(true)
  })

  test('tool failure is detected', () => {
    const checks = internalChecks(
      ctx({ toolExecutions: [{ tool: 'calculator', success: false, error: 'bad' }] }),
    )
    const c = checks.find((c) => c.name === 'no_tool_failures')
    expect(c?.passed).toBe(false)
    expect(c?.detail).toContain('calculator')
  })

  test('empty result is detected', () => {
    const checks = internalChecks(ctx({ result: '' }))
    expect(checks.find((c) => c.name === 'produced_result')?.passed).toBe(false)
  })

  test('iteration exhaustion is detected', () => {
    const checks = internalChecks(ctx({ iterationExhausted: true }))
    expect(checks.find((c) => c.name === 'no_iteration_exhaustion')?.passed).toBe(false)
  })
})
