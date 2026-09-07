import { describe, expect, test } from 'bun:test'
import { calculate, CalcError, tokenize } from '@/lib/agent/tools/calculator'

describe('calculator tokenizer', () => {
  test('tokenizes numbers and operators', () => {
    const tokens = tokenize('2 + 3 * 4')
    expect(tokens).toEqual([
      { kind: 'num', value: 2 },
      { kind: 'op', value: '+' },
      { kind: 'num', value: 3 },
      { kind: 'op', value: '*' },
      { kind: 'num', value: 4 },
    ])
  })

  test('rejects letters (injection attempts)', () => {
    expect(() => tokenize('process.exit(1)')).toThrow(CalcError)
    expect(() => tokenize('2;2')).toThrow(CalcError)
    expect(() => tokenize('__proto__')).toThrow(CalcError)
  })

  test('rejects malformed numbers', () => {
    expect(() => tokenize('1.2.3')).toThrow(CalcError)
  })
})

describe('calculator evaluate', () => {
  test('basic precedence', () => {
    expect(calculate('2 + 3 * 4')).toBe(14)
    expect(calculate('(2 + 3) * 4')).toBe(20)
    expect(calculate('10 / 4')).toBe(2.5)
    expect(calculate('10 % 3')).toBe(1)
  })

  test('power is right-associative', () => {
    expect(calculate('2 ^ 3 ^ 2')).toBe(512)
    expect(calculate('2 ^ 10')).toBe(1024)
  })

  test('unary minus', () => {
    expect(calculate('-5 + 3')).toBe(-2)
    expect(calculate('2 * -4')).toBe(-8)
    expect(calculate('--5')).toBe(5)
  })

  test('large multiplications (the benchmark values)', () => {
    expect(calculate('8347 * 2953')).toBe(24648691)
    expect(calculate('7261 * 4018')).toBe(29174698)
    expect(calculate('(1793 + 847) * 61')).toBe(161040)
  })

  test('division by zero is an error', () => {
    expect(() => calculate('1 / 0')).toThrow(CalcError)
    expect(() => calculate('5 % 0')).toThrow(CalcError)
  })

  test('rejects empty / oversized input', () => {
    expect(() => calculate('')).toThrow(CalcError)
    expect(() => calculate('   ')).toThrow(CalcError)
    expect(() => calculate('1+'.repeat(300))).toThrow(CalcError)
  })

  test('rejects unbalanced parens', () => {
    expect(() => calculate('(1 + 2')).toThrow(CalcError)
    expect(() => calculate('1 + 2)')).toThrow(CalcError)
  })
})
