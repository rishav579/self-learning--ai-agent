import { describe, expect, test } from 'bun:test'
import { cosineSimilarity, jaccardSimilarity, tokenize } from '@/lib/agent/memory/retrieval'

describe('tokenize', () => {
  test('lowercases and splits, dropping generic task stopwords', () => {
    expect(tokenize('Compute 8347 * 2953 and Report')).toEqual(['compute', '8347', '2953'])
  })

  test('drops stopwords and short tokens', () => {
    const tokens = tokenize('the a of to it is what me report give using use result value find')
    expect(tokens).toEqual([])
  })

  test('handles empty input', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize('   !!! ??? ')).toEqual([])
  })
})

describe('cosineSimilarity', () => {
  test('identical token bags score ~1', () => {
    const t = tokenize('compute exact multiplication calculator tool')
    expect(cosineSimilarity(t, t)).toBeCloseTo(1, 5)
  })

  test('disjoint token bags score 0', () => {
    expect(cosineSimilarity(tokenize('file read sandbox'), tokenize('web search internet'))).toBe(0)
  })

  test('partial overlap scores between 0 and 1', () => {
    const a = tokenize('compute hard multiplication exact result')
    const b = tokenize('compute hard multiplication integer')
    const s = cosineSimilarity(a, b)
    expect(s).toBeGreaterThan(0.3)
    expect(s).toBeLessThan(1)
  })

  test('similar task phrasings score high', () => {
    const a = tokenize('Compute 7261 * 4018 and report the exact integer result')
    const b = tokenize('Compute 9182 * 3311 and report the exact integer result')
    const s = cosineSimilarity(a, b)
    expect(s).toBeGreaterThan(0.5)
  })

  test('empty bags never divide by zero', () => {
    expect(cosineSimilarity([], ['x'])).toBe(0)
    expect(cosineSimilarity(['x'], [])).toBe(0)
  })
})

describe('jaccardSimilarity', () => {
  test('identical sets = 1', () => {
    expect(jaccardSimilarity(['a', 'b'], ['a', 'b'])).toBe(1)
  })
  test('disjoint sets = 0', () => {
    expect(jaccardSimilarity(['a'], ['b'])).toBe(0)
  })
  test('partial overlap', () => {
    const s = jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'd'])
    expect(s).toBeCloseTo(2 / 4, 5)
  })
})
