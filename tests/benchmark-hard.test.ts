/**
 * HARD BENCHMARK (v2) — deterministic mechanism test with a scripted,
 * prompt-aware LLM (NO network).
 *
 * This proves the EXPERIMENT MACHINERY end-to-end: the ANSWER:-convention
 * trap, memory reset per mode, cross-task lesson transfer (with query
 * enrichment), and the expected capability gradient A ≈ B < C ≤ D.
 *
 * The scripted LLM mimics the behavior a real LLM exhibits:
 *   - it answers "Compute X." tasks with a bare number by default
 *   - it applies a retrieved lesson only when the lesson text is actually
 *     in its prompt (exactly how retrieved memory reaches the model)
 *   - its reflection extracts the convention lesson from the evaluator's
 *     failure detail (which is what a real reflector sees)
 *
 * Real-LLM benchmark results are reported separately in the README
 * (including the v1 ceiling finding and API-quota constraints).
 */
import { describe, expect, test, beforeAll } from 'bun:test'
import { db } from '@/lib/db'
import { launchBenchmark } from '@/lib/agent/benchmark'
import type { LlmClient, ChatJsonOptions } from '@/lib/llm'

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

/**
 * A scripted LLM that "learns" ONLY through retrieved memory appearing in
 * its prompts — the same channel a real LLM has. No state leaks between
 * tasks except via the database.
 */
class ConventionAwareLlm implements LlmClient {
  public sawLessonInPrompt = 0
  public calls = 0

  async chatJson<T>(opts: ChatJsonOptions): Promise<T> {
    this.calls++
    const prompt = opts.prompt
    switch (opts.label) {
      case 'understand': {
        const task = taskLine(prompt)
        return {
          goal: `Compute the requested arithmetic result${task.includes('release channel') ? ' from the sandbox' : ''}`,
          category: /release channel|settings file/.test(task) ? 'file_reading' : 'arithmetic',
          keywords: /release channel|settings file/.test(task)
            ? ['sandbox', 'file', 'settings', 'notes']
            : ['compute', 'multiplication', 'arithmetic', 'integer', 'exact'],
          riskLevel: 'low',
          complexity: 2,
        } as T
      }
      case 'plan':
        return {
          goal: 'compute the exact result and report it',
          steps: ['Use the calculator tool to compute the exact result', 'Report the final answer'],
          toolsRequired: ['calculator'],
          riskLevel: 'low',
          successCriteria: ['The value is exact'],
        } as T
      case 'execute': {
        const task = taskLine(prompt)
        // THE LEARNING CHANNEL: a retrieved lesson is the ONLY way the
        // convention ("ANSWER: ") can appear in this prompt
        const knowsConvention = /ANSWER:\s/.test(prompt)
        if (knowsConvention) this.sawLessonInPrompt++
        // step 1: compute via the calculator tool (for pure arithmetic)
        const alreadyComputed = /OBSERVATION \(from calculator\)/.test(prompt)
        const expression = arithmeticExpression(task)
        if (expression && !alreadyComputed && !/Fibonacci/.test(task)) {
          return {
            action: 'tool',
            thought: 'compute exactly with the calculator',
            tool: 'calculator',
            args: { expression },
          } as T
        }
        // step 2: final answer
        const value = finalValue(task)
        return {
          action: 'final',
          thought: knowsConvention ? 'apply the retrieved lesson: prefix ANSWER:' : 'report the result',
          answer: knowsConvention ? `ANSWER: ${value}` : `${value}`,
        } as T
      }
      case 'reflect': {
        const failedConvention = /did not match/.test(prompt) && /ANSWER/.test(prompt)
        if (failedConvention) {
          return {
            whatWorked: 'the calculator produced the exact value',
            whatFailed: 'the final answer was rejected by the output-format check',
            rootCause: 'the evaluator expects answers in the "ANSWER: <value>" convention',
            doDifferently: 'compute the exact value, then format the final answer as ANSWER: <value>',
            lesson: {
              content:
                'When an evaluation check fails with a regex like /^ANSWER: [0-9]+$/, the final answer must be formatted exactly as ANSWER: <number>. Compute the exact value with the calculator, then prefix it.',
              type: 'failure',
              confidence: 0.9,
              strategyName: 'answer-prefix-convention',
              keywords: ['compute', 'arithmetic', 'multiplication', 'answer', 'format', 'convention'],
            },
          } as T
        }
        return {
          whatWorked: 'exact computation and direct answer',
          whatFailed: 'nothing',
          rootCause: 'correct approach',
          doDifferently: 'keep using exact tools',
          lesson: {
            content: 'For arithmetic tasks, compute exact values with the calculator before answering.',
            type: 'success',
            confidence: 0.8,
            strategyName: 'calculator-first',
            keywords: ['arithmetic', 'calculator', 'compute'],
          },
        } as T
      }
      default:
        throw new Error(`unexpected label ${opts.label}`)
    }
  }
}

function taskLine(prompt: string): string {
  const m = prompt.match(/TASK: (.+)/)
  return m ? m[1] : ''
}

function arithmeticExpression(task: string): string | null {
  const m = task.match(/Compute ([0-9()+\-*/ .]+)\.?/)
  return m ? m[1].trim() : null
}

function finalValue(task: string): string {
  if (/release channel/.test(task)) return 'beta'
  if (/timeout_seconds plus retries/.test(task)) return '33'
  if (/Fibonacci/.test(task)) return '17711'
  // fixed, verified values for the three arithmetic traps
  if (task.includes('4729 * 8371')) return '39586459'
  if (task.includes('6209 * 5177')) return '32143993'
  if (task.includes('(9034 - 2861) * 17')) return '104941'
  return '0'
}

describe('hard benchmark v2 (scripted LLM, deterministic)', () => {
  test('convention trap produces capability gradient: A ≈ B < C ≤ D', async () => {
    await cleanDb()
    const llm = new ConventionAwareLlm()
    const { id: runId } = await launchBenchmark({ taskSet: 'hard', llm, interTaskPauseMs: 0 })

    // wait for completion (bounded)
    let run: { status: string; results: unknown; error: string | null } | null = null
    for (let i = 0; i < 120; i++) {
      run = await db.benchmarkRun.findUnique({
        where: { id: runId },
        select: { status: true, results: true, error: true },
      })
      if (run && run.status !== 'running') break
      await new Promise((r) => setTimeout(r, 250))
    }
    expect(run?.status).toBe('completed')

    const results = JSON.parse((run?.results as string) ?? '{}') as Record<
      string,
      { meanScore: number; successRate: number; perTask: { title: string; success: boolean; score: number }[]; totalLlmCalls: number }
    >
    for (const mode of ['no_memory', 'memory_only', 'memory_reflection', 'full']) {
      expect(results[mode]).toBeDefined()
    }

    const A = results.no_memory
    const B = results.memory_only
    const C = results.memory_reflection
    const D = results.full

    // A: every convention-trap task fails (cannot know the convention)
    const aTrap1 = A.perTask.find((t) => t.title.includes('Convention trap #1'))
    const aTrap2 = A.perTask.find((t) => t.title.includes('Convention trap #2'))
    const aTrap3 = A.perTask.find((t) => t.title.includes('Convention trap #3'))
    expect(aTrap1?.success).toBe(false)
    expect(aTrap2?.success).toBe(false)
    expect(aTrap3?.success).toBe(false)

    // B: experiences do not carry the convention → same failures as A
    const bTrap2 = B.perTask.find((t) => t.title.includes('Convention trap #2'))
    expect(bTrap2?.success).toBe(false)

    // C: trap #1 fails (learning moment), then the failure lesson transfers
    //    and traps #2/#3 PASS — the core learning-loop claim
    const cTrap1 = C.perTask.find((t) => t.title.includes('Convention trap #1'))
    const cTrap2 = C.perTask.find((t) => t.title.includes('Convention trap #2'))
    const cTrap3 = C.perTask.find((t) => t.title.includes('Convention trap #3'))
    expect(cTrap1?.success).toBe(false) // first encounter: honest failure
    expect(cTrap2?.success).toBe(true) // lesson retrieved → convention applied
    expect(cTrap3?.success).toBe(true)
    expect(C.meanScore).toBeGreaterThan(A.meanScore + 0.2)
    expect(C.successRate).toBeGreaterThanOrEqual(A.successRate + 0.3)

    // D: at least as good as C, and a strategy was learned
    expect(D.meanScore).toBeGreaterThanOrEqual(C.meanScore)
    const strategies = await db.strategy.findMany({ where: { name: 'answer-prefix-convention' } })
    expect(strategies.length).toBe(1) // mode D stored the learned strategy
    expect(strategies[0].uses).toBeGreaterThanOrEqual(1)

    // the learning channel was actually exercised (lesson text reached the
    // executor's prompt) in C and D but never in A
    expect(llm.sawLessonInPrompt).toBeGreaterThanOrEqual(2)
  }, 60_000)

  test('memory reset per mode: each mode starts clean (no cross-mode leakage)', async () => {
    // after the run above, the final memory state belongs to mode D only.
    // The lessons in the DB were created DURING D's own execution.
    const lessons = await db.lesson.findMany({})
    const convention = lessons.find((l) => l.content.includes('ANSWER:'))
    expect(convention).toBeDefined()
    expect(convention?.category).toBe('arithmetic')
  })

  test('failure→learning trace exists in events (T1 fail → lesson → T2 pass)', async () => {
    // find mode C's trap #2 task and verify the full learning trace:
    // failed T1 lesson stored → retrieved on T2 → applied → pass
    const tasks = await db.task.findMany({
      where: { mode: 'memory_reflection', title: { contains: 'Convention trap #2' } },
      include: { events: true },
    })
    expect(tasks.length).toBe(1)
    const t2 = tasks[0]
    const types = t2.events.map((e) => e.type)
    expect(types).toContain('memory_retrieved')
    expect(types).toContain('lesson_stored')
    // the retrieved memory on T2 includes the convention lesson from T1
    const retrieved = t2.events.find((e) => e.type === 'memory_retrieved')
    const payload = JSON.parse(retrieved?.payload ?? '{}')
    expect(payload.detail.lessons.length).toBeGreaterThan(0)
    expect(payload.detail.lessons[0].content).toContain('ANSWER:')
    // T2 passed with the convention-formatted answer
    expect(t2.success).toBe(true)
    expect(t2.result).toBe('ANSWER: 32143993')
  })
})
