/**
 * Evaluator — objective-first scoring.
 *
 * If the task submitter supplied checks, they are the ground truth and the
 * evaluation is 100% objective (the agent CANNOT pass by judging itself).
 * If no checks exist, automatic internal objective checks (tool failures,
 * empty result, iteration exhaustion) are combined with an LLM rubric that
 * is explicitly marked subjective=false→true and weighted at only 50%.
 */
import vm from 'node:vm'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { CheckResult, CheckSpec, EvaluationResult, SubjectiveEvaluation } from './types'
import { SubjectiveEvaluationSchema } from './schemas'
import type { LlmClient } from '@/lib/llm'
import { truncate } from '@/lib/llm'

export interface EvaluationContext {
  taskInput: string
  result: string | null
  toolExecutions: { tool: string; success: boolean; error: string | null }[]
  iterations: number
  maxIterations: number
  iterationExhausted: boolean
}

// ---------------------------------------------------------------------------
// Objective checks
// ---------------------------------------------------------------------------

function extractNumbers(text: string): number[] {
  const matches = text.match(/-?\d+(?:\.\d+)?/g) ?? []
  return matches.map(Number)
}

/**
 * Run a submitter-supplied boolean expression against the result string.
 *
 * SECURITY: the expression is model/operator-supplied, so it runs in a
 * HARDENED vm context (same policy as the code_executor tool):
 *   - null-prototype sandbox (no host prototype chain on the global)
 *   - `result` and `numbers` are created INSIDE the context from JSON
 *     literals — passing host objects (e.g. a host array) would expose
 *     `numbers.constructor.constructor` → HOST Function → arbitrary code
 *     execution (verified empirically before this fix)
 *   - globalThis prototype severed; codeGeneration disabled
 *   - 1s execution timeout
 */
function runJsCheck(expression: string, result: string): { passed: boolean; detail: string } {
  try {
    const numbers = extractNumbers(result)
    const context = vm.createContext(Object.create(null), {
      codeGeneration: { strings: false, wasm: false },
    })
    // context-native bindings + hardening, all evaluated INSIDE the context
    vm.runInContext(
      `Object.setPrototypeOf(globalThis, null); result = ${JSON.stringify(result)}; numbers = ${JSON.stringify(numbers)}`,
      context,
      { timeout: 200 },
    )
    const outcome = new vm.Script(expression, { filename: 'eval-check.js' }).runInContext(context, { timeout: 1000 })
    if (typeof outcome === 'boolean') {
      return { passed: outcome, detail: `js_expression evaluated to ${outcome}` }
    }
    return { passed: false, detail: `js_expression did not return a boolean (got ${typeof outcome})` }
  } catch (e) {
    return { passed: false, detail: `js_expression error: ${(e as Error).message}` }
  }
}

export function runCheck(check: CheckSpec, ctx: EvaluationContext): CheckResult {
  const weight = check.weight ?? 1
  const result = ctx.result ?? ''
  const expected = check.expected ?? ''
  switch (check.type) {
    case 'output_contains': {
      if (!expected) return { name: check.name, type: check.type, passed: false, detail: 'Missing "expected" value', weight }
      const passed = result.toLowerCase().includes(expected.toLowerCase())
      return {
        name: check.name,
        type: check.type,
        passed,
        detail: passed ? `Result contains "${expected}"` : `Result does not contain "${expected}"`,
        weight,
      }
    }
    case 'numeric_match': {
      const target = Number(expected)
      if (!Number.isFinite(target)) {
        return { name: check.name, type: check.type, passed: false, detail: `Invalid expected number "${expected}"`, weight }
      }
      const tolerance = check.tolerance ?? 1e-4
      const numbers = extractNumbers(result)
      const found = numbers.find((n) => Math.abs(n - target) <= tolerance)
      return {
        name: check.name,
        type: check.type,
        passed: found !== undefined,
        detail:
          found !== undefined
            ? `Found matching number ${found} (target ${target} ±${tolerance})`
            : `No number matching ${target} ±${tolerance} in result (found: [${numbers.slice(0, 8).join(', ')}])`,
        weight,
      }
    }
    case 'regex_match': {
      try {
        const re = new RegExp(expected)
        const passed = re.test(result)
        return { name: check.name, type: check.type, passed, detail: passed ? 'Regex matched' : `Regex /${expected}/ did not match`, weight }
      } catch (e) {
        return { name: check.name, type: check.type, passed: false, detail: `Invalid regex: ${(e as Error).message}`, weight }
      }
    }
    case 'js_expression': {
      const r = runJsCheck(expected, ctx.result ?? '')
      return { name: check.name, type: check.type, passed: r.passed, detail: r.detail, weight }
    }
    case 'tool_succeeded': {
      const passed = ctx.toolExecutions.some((t) => t.tool === expected && t.success)
      return {
        name: check.name,
        type: check.type,
        passed,
        detail: passed ? `Tool "${expected}" executed successfully` : `Tool "${expected}" never succeeded`,
        weight,
      }
    }
    default:
      return { name: check.name, type: check.type, passed: false, detail: `Unknown check type`, weight }
  }
}

/** Automatic objective guardrails — always evaluated, cheap and honest. */
export function internalChecks(ctx: EvaluationContext): CheckResult[] {
  const failedTools = ctx.toolExecutions.filter((t) => !t.success)
  return [
    {
      name: 'no_tool_failures',
      type: 'tool_succeeded',
      passed: failedTools.length === 0,
      detail: failedTools.length === 0 ? 'All tool calls succeeded' : `${failedTools.length} tool call(s) failed: ${failedTools.map((t) => t.tool).join(', ')}`,
      weight: 0.5,
    },
    {
      name: 'produced_result',
      type: 'output_contains',
      passed: (ctx.result ?? '').trim().length > 0,
      detail: (ctx.result ?? '').trim().length > 0 ? 'Agent produced a non-empty final answer' : 'No final answer produced',
      weight: 1,
    },
    {
      name: 'no_iteration_exhaustion',
      type: 'output_contains',
      passed: !ctx.iterationExhausted,
      detail: ctx.iterationExhausted
        ? `Hit the iteration limit (${ctx.maxIterations}) without producing a final answer`
        : 'Finished within the iteration budget',
      weight: 0.5,
    },
  ]
}

function weightedScore(checks: CheckResult[]): number {
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0)
  if (totalWeight === 0) return 0
  const passed = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0)
  return Math.round((passed / totalWeight) * 1000) / 1000
}

// ---------------------------------------------------------------------------
// Main evaluation entry point
// ---------------------------------------------------------------------------

export async function evaluateTask(
  taskId: string,
  userChecks: CheckSpec[],
  ctx: EvaluationContext,
  llm: LlmClient,
): Promise<EvaluationResult> {
  if (userChecks.length > 0) {
    // PURE OBJECTIVE MODE — supplied checks are ground truth
    const checkResults = userChecks.map((c) => runCheck(c, ctx))
    const internal = internalChecks(ctx)
    const all = [...checkResults, ...internal]
    const score = weightedScore(checkResults)
    const summary =
      `Objective evaluation: ${checkResults.filter((c) => c.passed).length}/${checkResults.length} user checks passed` +
      ` (${internal.filter((c) => c.passed).length}/${internal.length} internal checks passed). ` +
      checkResults.map((c) => `${c.name}: ${c.passed ? 'PASS' : 'FAIL'} — ${c.detail}`).join(' | ')
    return { objective: true, checks: all, score, success: score >= 1 && checkResults.every((c) => c.passed), summary }
  }

  // FALLBACK: internal objective checks + LLM rubric (marked subjective)
  const internal = internalChecks(ctx)
  const objectiveScore = weightedScore(internal)
  let subjective: SubjectiveEvaluation | null = null
  try {
    subjective = await llm.chatJson<SubjectiveEvaluation>({
      label: 'evaluate',
      system:
        'You are a strict, skeptical evaluator of an AI agent. You judge whether the agent actually completed the task. Assume nothing — check the evidence in the trace. Do not reward effort, only correct outcomes.',
      prompt: `Task given to the agent:
${truncate(ctx.taskInput, 1500)}

The agent's final answer:
${truncate(ctx.result ?? '(no answer produced)', 2000)}

Execution trace summary:
- tool calls: ${ctx.toolExecutions.map((t) => `${t.tool}(${t.success ? 'ok' : 'FAIL'})`).join(', ') || 'none'}
- iterations used: ${ctx.iterations}/${ctx.maxIterations}
${ctx.iterationExhausted ? '- WARNING: iteration limit exhausted, answer may be incomplete' : ''}

Judge strictly whether the answer actually satisfies the task.`,
      shapeHint: `{"score": 0.0-1.0, "success": boolean, "summary": "one paragraph verdict", "strengths": "what worked", "weaknesses": "what was weak"}`,
      schema: SubjectiveEvaluationSchema,
    })
  } catch (e) {
    logger.warn('evaluator:rubric-failed', { taskId, error: (e as Error).message })
  }

  if (!subjective) {
    // LLM unavailable → fall back to purely internal objective checks
    const score = objectiveScore
    return {
      objective: true,
      checks: internal,
      score,
      success: score >= 1,
      summary: `Evaluation by internal objective checks only (LLM rubric unavailable): ${internal
        .map((c) => `${c.name}: ${c.passed ? 'PASS' : 'FAIL'}`)
        .join(' | ')}`,
    }
  }

  const combined = Math.round(((objectiveScore + subjective.score) / 2) * 1000) / 1000
  return {
    objective: false,
    checks: [
      ...internal,
      { name: 'llm_rubric', type: 'output_contains', passed: subjective.success, detail: truncate(subjective.summary, 400), weight: 1 },
    ],
    score: combined,
    success: combined >= 0.999 && internal.every((c) => c.name === 'no_tool_failures' ? c.passed : true),
    summary: `Mixed evaluation (internal objective ${objectiveScore.toFixed(2)} + LLM rubric ${subjective.score.toFixed(2)}). ${truncate(subjective.summary, 500)}`,
  }
}

/** Persist an evaluation row. */
export async function persistEvaluation(taskId: string, evaluation: EvaluationResult): Promise<void> {
  await db.evaluation.upsert({
    where: { taskId },
    create: {
      taskId,
      objective: evaluation.objective,
      checks: JSON.stringify(evaluation.checks),
      score: evaluation.score,
      success: evaluation.success,
      summary: evaluation.summary.slice(0, 2000),
    },
    update: {
      objective: evaluation.objective,
      checks: JSON.stringify(evaluation.checks),
      score: evaluation.score,
      success: evaluation.success,
      summary: evaluation.summary.slice(0, 2000),
    },
  })
}
