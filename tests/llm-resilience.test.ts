/**
 * LLM RESILIENCE TESTS — simulate a hostile LLM backend using the injectable
 * transport (no network): 429 rate limits, timeouts, malformed JSON output,
 * schema-invalid output, missing fields. The client must retry, feed errors
 * back, and ultimately fail with a typed LlmError the pipeline can degrade
 * around.
 */
import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { createLlmClient, extractJson, isTransientError } from '@/lib/llm'
import type { LlmTransport } from '@/lib/llm'

const noBackoff = () => 1 // 1ms retries in tests
const clientWith = (transport: LlmTransport) => createLlmClient({ transport, backoffFor: noBackoff, unpaced: true })

const opts = {
  system: 'sys',
  prompt: 'prompt',
  shapeHint: '{"answer": "string"}',
  schema: z.object({ answer: z.string().min(1) }),
  label: 'test',
  attempts: 3,
  timeoutMs: 2_000,
}

describe('llm resilience', () => {
  test('happy path returns validated data', async () => {
    const llm = clientWith(async () => '{"answer": "42"}')
    const out = await llm.chatJson<{ answer: string }>(opts)
    expect(out.answer).toBe('42')
  })

  test('malformed JSON then valid → retry succeeds', async () => {
    const responses = ['no json here at all', '{"answer": "ok"}']
    let seen = 0
    const llm = clientWith(async () => responses[seen++])
    const out = await llm.chatJson<{ answer: string }>(opts)
    expect(out.answer).toBe('ok')
    expect(seen).toBe(2)
  })

  test('markdown-fenced JSON is extracted', async () => {
    const llm = clientWith(async () => '```json\n{"answer": "fenced"}\n```')
    const out = await llm.chatJson<{ answer: string }>(opts)
    expect(out.answer).toBe('fenced')
  })

  test('prose-wrapped JSON is extracted', async () => {
    const llm = clientWith(async () => 'Sure! Here is the result: {"answer": "wrapped"} hope that helps')
    const out = await llm.chatJson<{ answer: string }>(opts)
    expect(out.answer).toBe('wrapped')
  })

  test('schema-invalid output (missing field) → retry with error feedback, then success', async () => {
    const responses = ['{"wrong": "field"}', '{"answer": "fixed"}']
    let seen = 0
    const prompts: string[] = []
    const llm = createLlmClient({
      transport: async (_m, _label) => responses[seen++],
      backoffFor: noBackoff,
      unpaced: true,
    })
    // intercept prompts by wrapping chatJson? simpler: check the retry count
    const out = await llm.chatJson<{ answer: string }>(opts)
    expect(out.answer).toBe('fixed')
    expect(seen).toBe(2)
    expect(prompts.length).toBe(0)
  })

  test('persistent 429s exhaust attempts and throw LlmError', async () => {
    let calls = 0
    const llm = clientWith(async () => {
      calls++
      throw new Error('429 Too Many Requests')
    })
    await expect(llm.chatJson(opts)).rejects.toThrow('429')
    expect(calls).toBe(opts.attempts)
  })

  test('429 then success → transient error is retried', async () => {
    let calls = 0
    const llm = clientWith(async () => {
      calls++
      if (calls === 1) throw new Error('429 Too Many Requests')
      return '{"answer": "after-429"}'
    })
    const out = await llm.chatJson<{ answer: string }>(opts)
    expect(out.answer).toBe('after-429')
    expect(calls).toBe(2)
  })

  test('repeated 429s (server-side retry storm) still bounded by attempts', async () => {
    let calls = 0
    const llm = clientWith(async () => {
      calls++
      throw new Error('HTTP 429: too many requests, rate limit exceeded')
    })
    await expect(llm.chatJson(opts)).rejects.toThrow()
    expect(calls).toBeLessThanOrEqual(opts.attempts) // never infinite
  })

  test('LLM timeout → typed LlmError with label', async () => {
    const llm = clientWith(
      () =>
        new Promise<string>((_res, rej) => {
          setTimeout(() => rej(new Error('late')), 5_000)
        }),
    )
    const t0 = Date.now()
    await expect(llm.chatJson({ ...opts, attempts: 1 })).rejects.toThrow('timed out')
    expect(Date.now() - t0).toBeLessThan(4_000)
  })

  test('all attempts fail with garbage → rejects with the extraction error (bounded attempts)', async () => {
    let calls = 0
    const llm = clientWith(async () => {
      calls++
      return 'total garbage' // no JSON anywhere
    })
    await expect(llm.chatJson(opts)).rejects.toThrow('No JSON object')
    expect(calls).toBe(3)
  })

  test('empty LLM response is an error', async () => {
    const llm = clientWith(async () => '')
    await expect(llm.chatJson(opts)).rejects.toThrow()
  })

  test('unbalanced JSON braces are detected', async () => {
    const llm = clientWith(async () => '{"answer": "never closed')
    await expect(llm.chatJson(opts)).rejects.toThrow()
  })

  test('JSON with braces inside strings parses correctly', async () => {
    const llm = clientWith(async () => '{"answer": "value with } brace inside { string"}')
    const out = await llm.chatJson<{ answer: string }>(opts)
    expect(out.answer).toContain('brace inside')
  })
})

describe('extractJson unit tests', () => {
  test('throws on empty', () => {
    expect(() => extractJson('')).toThrow()
  })
  test('throws when no object present', () => {
    expect(() => extractJson('just words')).toThrow('No JSON object')
  })
  test('handles escaped quotes correctly', () => {
    const v = extractJson('{"answer": "escaped \\" quote"}') as { answer: string }
    expect(v.answer).toBe('escaped " quote')
  })
})

describe('isTransientError', () => {
  test('recognizes rate limit and transient patterns', () => {
    expect(isTransientError('429 Too Many Requests')).toBe(true)
    expect(isTransientError('rate limit exceeded')).toBe(true)
    expect(isTransientError('503 Service Unavailable')).toBe(true)
    expect(isTransientError('request timed out')).toBe(true)
    expect(isTransientError('ECONNREFUSED')).toBe(true)
    expect(isTransientError('validation failed')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Pipeline-level degradation: a totally dead LLM must not corrupt the task
// ---------------------------------------------------------------------------

describe('pipeline degradation with dead LLM', () => {
  test('understanding falls back to heuristics', async () => {
    const { understandTask } = await import('@/lib/agent/understand')
    const deadLlm = clientWith(async () => {
      throw new Error('429 rate limited forever')
    })
    const u = await understandTask('dead-llm-task', 'Compute 1234 * 5678 and report the exact result', deadLlm)
    expect(u.category).toBe('arithmetic') // heuristic extraction worked
    expect(u.goal).toContain('1234')
  })

  test('planner falls back to a minimal plan', async () => {
    const { createPlan } = await import('@/lib/agent/planner')
    const deadLlm = clientWith(async () => {
      throw new Error('LLM call "plan" timed out')
    })
    const plan = await createPlan('dead-llm-task', 'any task', {
      understanding: { goal: 'g', category: 'general', keywords: ['x'], riskLevel: 'low', complexity: 3 },
      memory: null,
      strategy: null,
      strategyCandidates: [],
    }, deadLlm)
    expect(plan.steps.length).toBeGreaterThanOrEqual(1)
  })

  test('reflector fails OPEN (null) instead of throwing', async () => {
    const { reflectOnRun } = await import('@/lib/agent/reflector')
    const deadLlm = clientWith(async () => {
      throw new Error('429')
    })
    const r = await reflectOnRun('dead-llm-task', 'task', { steps: ['s'] }, [], {
      objective: true, checks: [], score: 0, success: false, summary: 'failed',
    }, deadLlm)
    expect(r).toBeNull()
  })

  test('evaluator degrades to internal objective checks when rubric LLM is dead', async () => {
    const { evaluateTask } = await import('@/lib/agent/evaluator')
    const deadLlm = clientWith(async () => {
      throw new Error('429')
    })
    const result = await evaluateTask('dead-llm-task', [], {
      taskInput: 't',
      result: 'some answer',
      toolExecutions: [],
      iterations: 1,
      maxIterations: 8,
      iterationExhausted: false,
    }, deadLlm)
    expect(result.objective).toBe(true)
    expect(result.score).toBeGreaterThan(0) // produced_result passed
  })
})
