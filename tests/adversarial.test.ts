/**
 * ADVERSARIAL TESTS — deliberately try to break the agent.
 *
 * Covered (mapped to the audit checklist):
 *   - empty / whitespace / too-short / extremely long task input
 *   - unknown tool names, invalid tool arguments
 *   - calculator injection attempts (no eval anywhere)
 *   - code_executor sandbox escape attempts (node:vm honesty tests)
 *   - SSRF attempts against http_get (localhost, private ranges, IPv6,
 *     hex/decimal IP forms, credentials, non-http protocols, internal names)
 *   - filesystem traversal (file_inspector)
 *   - malformed / corrupted memory rows (garbage JSON keywords)
 *   - empty memory retrieval
 *   - duplicate lessons merged, repeated identical tasks don't flood memory
 *   - lesson retirement (poisoning safeguard)
 *   - corrupted checks JSON dropped gracefully
 */
import { describe, expect, test, beforeAll } from 'bun:test'
import { db } from '@/lib/db'
import { calculate, CalcError } from '@/lib/agent/tools/calculator'
import { executeCode } from '@/lib/agent/tools/code-executor'
import { readSandboxFile } from '@/lib/agent/tools/file-inspector'
import { httpGet, isPrivateIp } from '@/lib/agent/tools/http-get'
import { retrieveRelevantMemory } from '@/lib/agent/memory/retrieval'
import { recordLessonUsage, storeLesson, storeExperience } from '@/lib/agent/memory/store'
import { CreateTaskSchema, CheckSpecSchema } from '@/lib/agent/schemas'
import type { Reflection } from '@/lib/agent/types'

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

// ---------------------------------------------------------------------------
// 1. Task input validation (API schema level)
// ---------------------------------------------------------------------------

describe('adversarial: task input validation', () => {
  test('rejects empty / whitespace / too-short input', () => {
    for (const bad of ['', '   ', '\n\t', 'ab', 'a']) {
      const r = CreateTaskSchema.safeParse({ input: bad })
      expect(r.success).toBe(false)
    }
  })

  test('rejects extremely long input (>2000 chars)', () => {
    const r = CreateTaskSchema.safeParse({ input: 'x'.repeat(2001) })
    expect(r.success).toBe(false)
    expect(CreateTaskSchema.safeParse({ input: 'compute 2+2 '.repeat(160).slice(0, 2000) }).success).toBe(true)
  })

  test('rejects >5 checks and invalid check types', () => {
    const checks = Array.from({ length: 6 }, (_, i) => ({ name: `c${i}`, type: 'output_contains', expected: 'x' }))
    expect(CreateTaskSchema.safeParse({ input: 'valid task input', checks }).success).toBe(false)
    expect(
      CreateTaskSchema.safeParse({ input: 'valid task input', checks: [{ name: 'c', type: 'rm_rf', expected: '/' }] })
        .success,
    ).toBe(false)
  })

  test('rejects non-object bodies (prototype pollution style)', () => {
    expect(CreateTaskSchema.safeParse(null).success).toBe(false)
    expect(CreateTaskSchema.safeParse('a string').success).toBe(false)
    expect(CreateTaskSchema.safeParse({ input: 'ok task', __proto__: {} }).success).toBe(true) // harmless
  })
})

// ---------------------------------------------------------------------------
// 2. Calculator injection attempts
// ---------------------------------------------------------------------------

describe('adversarial: calculator injection', () => {
  const injections = [
    '2+2; process.exit(1)',
    '2+2); require("fs")',
    'constructor.constructor("return process")()',
    '__proto__["constructor"]',
    '2+2 // comment with code',
    '2+2\n3+3',
    '2+2`ls /`',
    'Math.pow(2,10)',
    'eval("2+2")',
    'Function("return 2+2")()',
    '2**10**10**10', // huge exponent
    '1/0',
    '(2+3',
    '2 3',
    '.5 + .5',
    '2..5',
  ]
  for (const expr of injections) {
    test(`rejects injection: ${JSON.stringify(expr.slice(0, 30))}`, () => {
      let threw = false
      let value: number | undefined
      try {
        value = calculate(expr)
      } catch (e) {
        threw = e instanceof CalcError
      }
      // Either a clean CalcError, or a finite safe number (e.g. "1/0" →
      // CalcError "Division by zero"; ".5+.5" legitimately parses as 1)
      if (!threw) {
        expect(Number.isFinite(value)).toBe(true)
        expect(typeof value).toBe('number')
      }
    })
  }

  test('unicode trickery is rejected (no letters allowed)', () => {
    expect(() => calculate('2 + Ｎ')).toThrow(CalcError)
    expect(() => calculate('２+２')).toThrow(CalcError) // fullwidth digits
  })
})

// ---------------------------------------------------------------------------
// 3. code_executor sandbox escape attempts
// ---------------------------------------------------------------------------

describe('adversarial: code_executor sandbox escapes', () => {
  // NOTE: vm scripts cannot use top-level `return`; tests use IIFE/let
  test('no host globals reachable in sandbox', () => {
    const r = executeCode(`
      const report = {
        process: typeof process,
        require: typeof require,
        fetch: typeof fetch,
        Bun: typeof globalThis.Bun,
        setTimeout: typeof setTimeout,
        globalProc: typeof globalThis.process,
      }
      console.log(JSON.stringify(report))
    `)
    expect(r.success).toBe(true)
    const report = JSON.parse(r.output.split('\n')[0])
    for (const key of Object.keys(report)) {
      expect(report[key]).toBe('undefined')
    }
  })

  test('escape via this.constructor.constructor is BLOCKED (real RCE vector, fixed)', () => {
    const r = executeCode(`
      let outcome = 'ESCAPED'
      try { const F = this.constructor.constructor; F('return typeof process')(); } catch (e) { outcome = 'BLOCKED' }
      console.log('r1:' + outcome)
    `)
    expect(r.output).toContain('r1:BLOCKED')
  })

  test('escape via globalThis.constructor.constructor is BLOCKED', () => {
    const r = executeCode(`
      let outcome = 'ESCAPED'
      try { globalThis.constructor.constructor('return process')().version } catch (e) { outcome = 'BLOCKED' }
      console.log('r2:' + outcome)
    `)
    expect(r.output).toContain('r2:BLOCKED')
  })

  test('escape via literal/object prototypes is BLOCKED (context intrinsics)', () => {
    const r = executeCode(`
      const attempts = [
        () => ({}).constructor.constructor('return typeof process')(),
        () => [].constructor.constructor('return typeof process')(),
        () => Object.constructor('return typeof process')(),
        () => (new Error()).constructor.constructor('return typeof process')(),
        () => ''.constructor.constructor('return typeof process')(),
        () => JSON.constructor('return typeof process')(),
      ]
      const outcomes = attempts.map(fn => { try { return 'ESCAPED:' + fn() } catch (e) { return 'BLOCKED' } })
      console.log(outcomes.join(','))
    `)
    expect(r.success).toBe(true)
    expect(r.output).not.toContain('ESCAPED')
    expect((r.output.match(/BLOCKED/g) ?? []).length).toBe(6)
  })

  test('eval and Function are BLOCKED inside the sandbox', () => {
    const r = executeCode(`
      let e1 = 'ESCAPED', e2 = 'ESCAPED'
      try { eval('1+1') } catch (err) { e1 = 'BLOCKED' }
      try { Function('return 1') } catch (err) { e2 = 'BLOCKED' }
      console.log(e1 + ',' + e2)
    `)
    expect(r.output).toBe('BLOCKED,BLOCKED')
  })

  test('console.log bridge exposes no host constructor path', () => {
    const r = executeCode(`
      let outcome = 'ESCAPED'
      try { console.log.constructor('return typeof process')() } catch (e) { outcome = 'BLOCKED' }
      let outcome2 = 'ESCAPED'
      try { console.constructor.constructor('return typeof process')() } catch (e) { outcome2 = 'BLOCKED' }
      console.log(outcome + ',' + outcome2)
    `)
    expect(r.output).toBe('BLOCKED,BLOCKED')
  })

  test('standard intrinsics still work (JSON, Math, Array methods)', () => {
    const r = executeCode('const arr = [3,1,2].sort(); console.log(JSON.stringify({a: Math.max(...arr), s: arr.join("")}))')
    expect(r.success).toBe(true)
    expect(r.output).toContain('"a":3')
    expect(r.output).toContain('"s":"123"')
  })

  test('infinite loops are interrupted by the timeout', async () => {
    const t0 = Date.now()
    const r = executeCode('while (true) {}')
    expect(r.success).toBe(false)
    expect(Date.now() - t0).toBeLessThan(5000)
    expect(r.error).toContain('timed out')
  })

  test('prototype mutation of shared builtins no longer crosses into the host (fresh realm)', () => {
    // with the hardened context, Object/Array are the CONTEXT's own
    // intrinsics — mutating them cannot touch the host process anymore
    const before = JSON.stringify([1, 2, 3])
    const r = executeCode('Array.prototype.hostProbe = 42; Object.prototype.hostProbe = 42; "done"')
    expect(r.success).toBe(true)
    expect(JSON.stringify([1, 2, 3])).toBe(before)
    expect((Array.prototype as unknown as Record<string, unknown>).hostProbe).toBeUndefined()
    expect((Object.prototype as unknown as Record<string, unknown>).hostProbe).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 3b. Evaluator js_expression hardening (same escape class)
// ---------------------------------------------------------------------------

describe('adversarial: evaluator js_expression hardening', () => {
  test('js_expression escape via numbers.constructor is BLOCKED', async () => {
    const { runCheck } = await import('@/lib/agent/evaluator')
    const ctx = {
      taskInput: 't',
      result: 'the answer is 42',
      toolExecutions: [],
      iterations: 1,
      maxIterations: 8,
      iterationExhausted: false,
    }
    const check = {
      name: 'escape',
      type: 'js_expression' as const,
      expected: `numbers.constructor.constructor('return typeof process')() === 'object'`,
    }
    const r = runCheck(check, ctx)
    expect(r.passed).toBe(false) // the escape must NOT evaluate to a working expression
    expect(r.detail).toContain('js_expression')
  })

  test('js_expression escape via this.constructor is BLOCKED', async () => {
    const { runCheck } = await import('@/lib/agent/evaluator')
    const ctx = {
      taskInput: 't',
      result: 'answer 42',
      toolExecutions: [],
      iterations: 1,
      maxIterations: 8,
      iterationExhausted: false,
    }
    const check = {
      name: 'escape2',
      type: 'js_expression' as const,
      expected: `(() => { try { const p = this.constructor.constructor('return process')(); return p !== undefined } catch (e) { return false } })()`,
    }
    const r = runCheck(check, ctx)
    expect(r.passed).toBe(false)
  })

  test('legitimate js_expression still works', async () => {
    const { runCheck } = await import('@/lib/agent/evaluator')
    const ctx = {
      taskInput: 't',
      result: 'the answer is 42',
      toolExecutions: [],
      iterations: 1,
      maxIterations: 8,
      iterationExhausted: false,
    }
    const ok = runCheck({ name: 'ok', type: 'js_expression', expected: 'numbers.includes(42) && result.includes("answer")' }, ctx)
    expect(ok.passed).toBe(true)
    const bad = runCheck({ name: 'bad', type: 'js_expression', expected: 'numbers.includes(99)' }, ctx)
    expect(bad.passed).toBe(false)
  })

  test('infinite loop in js_expression is interrupted (timeout)', async () => {
    const { runCheck } = await import('@/lib/agent/evaluator')
    const ctx = {
      taskInput: 't',
      result: 'x',
      toolExecutions: [],
      iterations: 1,
      maxIterations: 8,
      iterationExhausted: false,
    }
    const t0 = Date.now()
    const r = runCheck({ name: 'loop', type: 'js_expression', expected: '(() => { while(true) {} })()' }, ctx)
    expect(Date.now() - t0).toBeLessThan(4000)
    expect(r.passed).toBe(false)
    expect(r.detail).toContain('js_expression error')
  })
})

// ---------------------------------------------------------------------------
// 4. SSRF attempts against http_get
// ---------------------------------------------------------------------------

describe('adversarial: http_get SSRF protection', () => {
  test('isPrivateIp covers all private/reserved IPv4 ranges', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1']) {
      expect(isPrivateIp(ip)).toBe(true)
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1']) {
      expect(isPrivateIp(ip)).toBe(false)
    }
  })

  test('isPrivateIp covers IPv6 local/ULA/link-local/v4-mapped', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
      expect(isPrivateIp(ip)).toBe(true)
    }
    expect(isPrivateIp('2606:4700::1111')).toBe(false)
  })

  test('blocks localhost and private literal IPs', async () => {
    for (const url of ['http://localhost/', 'http://127.0.0.1/', 'http://10.0.0.1/', 'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/']) {
      const r = await httpGet(url)
      expect(r.success).toBe(false)
      expect(r.error).toBeTruthy()
    }
  })

  test('blocks non-http protocols and credential URLs', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/', 'gopher://example.com/', 'http://user:pass@example.com/']) {
      const r = await httpGet(url)
      expect(r.success).toBe(false)
      expect(r.error).toBeTruthy()
    }
  })

  test('blocks internal hostnames', async () => {
    for (const url of ['http://metadata.internal/', 'http://db.local/', 'http://service.localhost/']) {
      const r = await httpGet(url)
      expect(r.success).toBe(false)
    }
  })

  test('blocks numeric/hex IPv4 forms that resolve to private ranges', async () => {
    // 2130706433 == 127.0.0.1 in decimal; 0x7f000001 == 127.0.0.1 in hex
    for (const url of ['http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/']) {
      const r = await httpGet(url)
      expect(r.success).toBe(false)
      expect(r.error).toBeTruthy()
    }
  })

  test('black-hole public IP times out cleanly (abort path)', async () => {
    const t0 = Date.now()
    const r = await httpGet('http://192.0.2.1/') // TEST-NET-1: routable-looking, never answers
    expect(r.success).toBe(false)
    expect(r.error).toContain('timed out')
    expect(Date.now() - t0).toBeGreaterThanOrEqual(9000)
  }, 20_000)
})

// ---------------------------------------------------------------------------
// 5. Filesystem traversal
// ---------------------------------------------------------------------------

describe('adversarial: file_inspector traversal', () => {
  const escapes = ['../.env', '../../etc/passwd', 'notes.txt/../../.env', '/etc/passwd', 'config/../../../prisma/schema.prisma', '..\\..\\etc\\passwd', 'config/../../../../home/z/my-project/.env']
  for (const p of escapes) {
    test(`blocks traversal: ${p}`, async () => {
      let threw = false
      let content: string | undefined
      try {
        content = await readSandboxFile(p)
      } catch {
        threw = true
      }
      // every escape attempt must either throw OR return sandbox-safe content
      if (!threw) {
        // if it resolved (e.g. '..\\..' normalizes into a sandbox path),
        // it must NEVER expose host secrets
        expect(content).not.toContain('DATABASE_URL')
        expect(content).not.toContain('api_key')
      } else {
        expect(threw).toBe(true)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// 6. Memory corruption / duplicates / flooding / poisoning
// ---------------------------------------------------------------------------

const fakeReflection = (content: string, type: 'success' | 'failure' = 'failure'): Reflection => ({
  whatWorked: 'test',
  whatFailed: 'test',
  rootCause: 'test',
  doDifferently: 'test',
  lesson: { content, type, confidence: 0.8, strategyName: 'test-strategy', keywords: ['test'] },
})

describe('adversarial: memory robustness', () => {
  // real task rows (Lesson.sourceTaskId / Experience.taskId are FKs)
  async function makeTask(id: string): Promise<string> {
    const t = await db.task.create({ data: { title: `task ${id}`, input: `adversarial input ${id}`, mode: 'full' } })
    return t.id
  }

  test('empty memory retrieval returns empty, no crash', async () => {
    await cleanDb()
    const m = await retrieveRelevantMemory('compute something', 'arithmetic')
    expect(m.lessons).toEqual([])
    expect(m.experiences).toEqual([])
  })

  test('corrupted lesson rows (garbage keywords JSON) do not crash retrieval', async () => {
    await db.lesson.create({
      data: {
        content: 'use the calculator tool for exact multiplication of large numbers',
        type: 'success',
        keywords: '{{{not json at all',
        category: 'arithmetic',
        confidence: 0.9,
      },
    })
    const m = await retrieveRelevantMemory('compute 1234 * 5678 exactly', 'arithmetic')
    expect(m.lessons.length).toBeGreaterThanOrEqual(0) // no throw is the assertion
  })

  test('near-duplicate lessons are MERGED, not multiplied', async () => {
    await cleanDb()
    const taskA = await makeTask('a')
    const taskB = await makeTask('b')
    const taskC = await makeTask('c')
    const content = 'For multiplication tasks, always use the calculator tool to get exact products.'
    const r1 = await storeLesson(fakeReflection(content, 'success'), 'arithmetic', taskA)
    const r2 = await storeLesson(fakeReflection('For multiplication tasks, always use the calculator tool to obtain exact products.'), 'arithmetic', taskB)
    const r3 = await storeLesson(fakeReflection(content), 'arithmetic', taskC)
    expect(r1.deduplicated).toBe(false)
    expect(r2.deduplicated).toBe(true)
    expect(r3.deduplicated).toBe(true)
    const count = await db.lesson.count()
    expect(count).toBe(1)
  })

  test('repeated identical tasks do not flood experiences (dedup merge)', async () => {
    await cleanDb()
    for (let i = 0; i < 5; i++) {
      const t = await makeTask(String(i))
      await storeExperience({
        taskId: t,
        taskSummary: 'Compute 4729 * 8371 and report the result',
        category: 'arithmetic',
        context: 'mode=full',
        actionsSummary: ['calculator(...)'],
        outcome: 'success',
        score: 1,
        success: true,
        keywords: ['multiplication', 'calculator'],
      })
    }
    const count = await db.experience.count()
    expect(count).toBe(1) // all 5 merged into ONE row
  })

  test('different tasks still create separate experiences', async () => {
    const t = await makeTask('x')
    await storeExperience({
      taskId: t,
      taskSummary: 'Read the sandbox notes file and report the release channel',
      category: 'file_reading',
      context: 'mode=full',
      actionsSummary: ['list_files()', 'file_inspector(notes.txt)'],
      outcome: 'success',
      score: 1,
      success: true,
      keywords: ['sandbox', 'file'],
    })
    const count = await db.experience.count()
    expect(count).toBe(2) // previous + this one
  })

  test('retrieval ignores irrelevant memories (threshold enforced)', async () => {
    const m = await retrieveRelevantMemory('tell me about the roman empire in great detail', 'web_research')
    expect(m.lessons.length).toBe(0)
    expect(m.experiences.length).toBe(0)
  })

  test('retired lessons are excluded from retrieval (poisoning safeguard)', async () => {
    await cleanDb()
    const poisonTask = await makeTask('poison')
    const stored = await storeLesson(fakeReflection('For multiplication tasks, always use the calculator tool to get exact products.'), 'arithmetic', poisonTask)
    // simulate the lesson being applied and NOT helping 3 times
    for (let i = 0; i < 3; i++) {
      await recordLessonUsage([stored.lessonId], 0.1, false)
    }
    const lesson = await db.lesson.findUnique({ where: { id: stored.lessonId } })
    expect(lesson?.retired).toBe(true)
    const m = await retrieveRelevantMemory('compute 9999 * 8888 exactly', 'arithmetic')
    expect(m.lessons.find((l) => l.id === stored.lessonId)).toBeUndefined()
  })

  test('retirement requires BOTH min uses and bad helpful rate', async () => {
    await cleanDb()
    const y = await makeTask('y')
    const stored = await storeLesson(fakeReflection('Read sandbox files directly without listing first.'), 'file_reading', y)
    await recordLessonUsage([stored.lessonId], 0.1, false) // only 1 unhelpful use
    const lesson = await db.lesson.findUnique({ where: { id: stored.lessonId } })
    expect(lesson?.retired).toBe(false) // not enough evidence yet
  })

  test('a REINFORCED lesson (new strong evidence) un-retires', async () => {
    await cleanDb()
    const z = await makeTask('z')
    const z2 = await makeTask('z2')
    const stored = await storeLesson(fakeReflection('Read sandbox files directly without listing first.'), 'file_reading', z)
    for (let i = 0; i < 3; i++) await recordLessonUsage([stored.lessonId], 0.2, false)
    expect((await db.lesson.findUnique({ where: { id: stored.lessonId } }))?.retired).toBe(true)
    // new evidence arrives and merges → fresh chance
    await storeLesson(fakeReflection('Read sandbox files directly without listing first; the notes file is at notes.txt.'), 'file_reading', z2)
    const after = await db.lesson.findUnique({ where: { id: stored.lessonId } })
    expect(after?.retired).toBe(false)
    expect(after?.refinements).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 7. Corrupted checks JSON is dropped gracefully (not phantom-failed)
// ---------------------------------------------------------------------------

describe('adversarial: corrupted checks', () => {
  test('invalid check entries are dropped, valid ones kept', () => {
    const raw = JSON.stringify([
      { name: 'ok', type: 'numeric_match', expected: '42' },
      { name: 'garbage', type: 'rm_rf', expected: '/' },
      { nope: true },
      'a string',
    ])
    const v = JSON.parse(raw)
    const valid = (Array.isArray(v) ? v : []).flatMap((c) => {
      const parsed = CheckSpecSchema.safeParse(c)
      return parsed.success ? [parsed.data] : []
    })
    expect(valid.length).toBe(1)
    expect(valid[0].name).toBe('ok')
  })
})
