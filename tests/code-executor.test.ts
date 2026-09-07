import { describe, expect, test } from 'bun:test'
import { executeCode } from '@/lib/agent/tools/code-executor'

describe('code_executor sandbox', () => {
  test('computes values and returns completion', () => {
    const r = executeCode('610 * 7')
    expect(r.success).toBe(true)
    expect(r.output).toContain('4270')
  })

  test('captures console.log', () => {
    const r = executeCode('console.log("hello", 42)')
    expect(r.success).toBe(true)
    expect(r.output).toContain('hello 42')
  })

  test('fibonacci algorithm', () => {
    const r = executeCode('const fib = n => n < 2 ? n : fib(n-1) + fib(n-2); console.log(fib(15));')
    expect(r.success).toBe(true)
    expect(r.output).toContain('610')
  })

  test('NO access to process / require / fs', () => {
    const r = executeCode('typeof process')
    expect(r.success).toBe(true)
    expect(r.output).toContain('undefined')

    const r2 = executeCode('typeof require')
    expect(r2.success).toBe(true)
    expect(r2.output).toContain('undefined')

    const r3 = executeCode('typeof globalThis')
    expect(r3.success).toBe(true)
    // the vm context is a fresh global; process must not leak in
    expect(r3.output).not.toContain('[object process]')
  })

  test('timeout interrupts infinite loops', () => {
    const r = executeCode('while (true) {}')
    expect(r.success).toBe(false)
    expect(r.error).toBeDefined()
  })

  test('rejects empty and oversized code', () => {
    expect(executeCode('').success).toBe(false)
    expect(executeCode(' '.repeat(10)).success).toBe(false)
    expect(executeCode('x'.repeat(6000)).success).toBe(false)
  })
})
