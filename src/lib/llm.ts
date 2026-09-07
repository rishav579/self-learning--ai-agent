/**
 * LLM client wrapper with:
 *  - cached ZAI singleton (real backend, server-side only)
 *  - structured JSON output validated against zod schemas
 *  - retries with error feedback, per-call timeout, hard failure errors
 *  - an injectable transport so tests can simulate 429s / timeouts /
 *    malformed output deterministically (no network)
 */
import type { z } from 'zod'
import { logger } from '@/lib/logger'

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class LlmError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'LlmError'
  }
}

export interface ChatJsonOptions {
  system: string
  prompt: string
  /** Short human-readable description of the expected shape (embedded in the prompt). */
  shapeHint: string
  schema: z.ZodType<unknown>
  /** total attempts (default 3) */
  attempts?: number
  /** per-attempt timeout in ms (default 90s) */
  timeoutMs?: number
  label: string // for logging / error messages
}

/**
 * The raw transport performs ONE LLM request. Injectable for tests.
 * Returns the assistant message content or throws.
 */
export type LlmTransport = (messages: ChatMsg[], label: string) => Promise<string>

export interface LlmClient {
  chatJson<T>(opts: ChatJsonOptions): Promise<T>
}

// ---------------------------------------------------------------------------
// JSON extraction utilities
// ---------------------------------------------------------------------------

/** Strip markdown fences and find the first balanced top-level JSON object. */
export function extractJson(text: string): unknown {
  if (!text) throw new LlmError('Empty LLM response')
  let t = text.trim()
  // remove leading/trailing code fences
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = t.indexOf('{')
  if (start === -1) throw new LlmError('No JSON object found in LLM output')
  // balanced-brace scan, respecting strings
  let depth = 0
  let inStr = false
  let escaped = false
  for (let i = start; i < t.length; i++) {
    const ch = t[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        const candidate = t.slice(start, i + 1)
        try {
          return JSON.parse(candidate)
        } catch (e) {
          throw new LlmError(`JSON.parse failed: ${(e as Error).message}`)
        }
      }
    }
  }
  throw new LlmError('Unbalanced JSON in LLM output')
}

// ---------------------------------------------------------------------------
// Real transport (z-ai-web-dev-sdk, server only)
// ---------------------------------------------------------------------------

async function loadSdk() {
  const mod = (await import('z-ai-web-dev-sdk')).default
  return mod.create()
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Detect rate-limit / transient server errors that are worth backing off for. */
export function isTransientError(message: string): boolean {
  return /429|too many requests|rate ?limit|overloaded|503|502|timeout|timed out|network|econn|socket|fetch failed/i.test(message)
}

/**
 * Backoff for rate limits: 10s, 20s, 40s, capped 60s.
 * The upstream API throttles long-running workloads hard; short backoffs
 * just burn retries inside the same throttle window.
 */
function backoffMs(attempt: number, transient: boolean): number {
  const base = transient ? 10_000 : 500
  return Math.min(base * Math.pow(2, attempt - 1), 60_000)
}

// ---------------------------------------------------------------------------
// Global rate limiter: smooths request spacing across the whole process
// (single user queue + benchmark) so we stay under API rate limits.
// ---------------------------------------------------------------------------
const MIN_INTERVAL_MS = 2_500
let lastRequestAt = 0
let rateQueue: Promise<void> = Promise.resolve()

/** Serialize LLM requests with a minimum spacing between them. */
function paced<T>(fn: () => Promise<T>): Promise<T> {
  const job = rateQueue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await delay(wait)
    lastRequestAt = Date.now()
  })
  rateQueue = job.then(
    () => undefined,
    () => undefined,
  )
  return job.then(fn)
}

let zaiPromise: Promise<Awaited<ReturnType<typeof loadSdk>>> | null = null
function getZai() {
  if (!zaiPromise) {
    zaiPromise = loadSdk().catch((e) => {
      zaiPromise = null // allow retry on next call
      throw new LlmError(`ZAI SDK init failed: ${e?.message ?? e}`)
    })
  }
  return zaiPromise
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LlmError(`LLM call "${label}" timed out after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e instanceof LlmError ? e : new LlmError(`LLM call "${label}" failed: ${e?.message ?? e}`))
      },
    )
  })
}

/** Truncate long strings for logs / prompts (never log secrets). */
export function truncate(s: string, max: number): string {
  if (!s) return s
  return s.length <= max ? s : s.slice(0, max) + `…[truncated ${s.length - max} chars]`
}

/** Options for createLlmClient — used by tests to inject a fake transport. */
export interface CreateLlmClientOptions {
  transport?: LlmTransport
  /** override retry backoff delays (ms) — tests use tiny values */
  backoffFor?: (attempt: number, transient: boolean) => number
  /** disable the global rate limiter pacing (tests) */
  unpaced?: boolean
}

export function createLlmClient(opts: CreateLlmClientOptions = {}): LlmClient {
  const transport: LlmTransport =
    opts.transport ??
    (async (messages, label) => {
      const zai = await getZai()
      const completion = await zai.chat.completions.create({
        messages,
        thinking: { type: 'disabled' },
      })
      const content: string | undefined = completion?.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        throw new LlmError(`LLM "${label}" returned no content`)
      }
      return content
    })
  const backoffFor = opts.backoffFor ?? backoffMs
  const run = <T>(fn: () => Promise<T>, label: string, timeoutMs: number): Promise<T> =>
    opts.unpaced ? withTimeout(fn(), timeoutMs, label) : withTimeout(paced(fn), timeoutMs, label)

  return {
    async chatJson<T>(optsIn: ChatJsonOptions): Promise<T> {
      const attempts = optsIn.attempts ?? 4
      const timeoutMs = optsIn.timeoutMs ?? 120_000
      const schema = optsIn.schema
      const system = `${optsIn.system}\n\nCRITICAL OUTPUT RULES:\n- Respond with a SINGLE valid JSON object and NOTHING else.\n- No prose, no markdown, no code fences.\n- Your entire response must be parseable by JSON.parse.`
      let lastError = ''
      let lastRaw = ''
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const feedback =
          attempt > 1 && lastError
            ? `\n\nYour previous response was INVALID.\nPrevious response (truncated): ${truncate(lastRaw, 800)}\nValidation error: ${lastError}\nFix it and respond with a single valid JSON object only.`
            : ''
        const prompt = `${optsIn.prompt}\n\nThe JSON object must have this shape:\n${optsIn.shapeHint}${feedback}`
        const t0 = Date.now()
        try {
          const content = await run(
            () => transport([{ role: 'system', content: system }, { role: 'user', content: prompt }], optsIn.label),
            optsIn.label,
            timeoutMs,
          )
          if (typeof content !== 'string' || !content.trim()) {
            throw new LlmError(`LLM "${optsIn.label}" returned no content`)
          }
          lastRaw = content
          const parsed = extractJson(content)
          const validated = schema.safeParse(parsed)
          if (!validated.success) {
            lastError = validated.error.issues
              .slice(0, 5)
              .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
              .join('; ')
            logger.warn(`llm:${optsIn.label}:schema-invalid`, { attempt, issues: lastError })
            if (attempt < attempts) await delay(backoffFor(attempt, false))
            continue
          }
          logger.debug(`llm:${optsIn.label}:ok`, { ms: Date.now() - t0, attempt })
          return validated.data as T
        } catch (e) {
          lastError = (e as Error).message
          const transient = isTransientError(lastError)
          logger.warn(`llm:${optsIn.label}:attempt-failed`, { attempt, transient, error: truncate(lastError, 200) })
          // If this was the last attempt, rethrow
          if (attempt === attempts) throw e
          // Back off before the next attempt — critical for 429 rate limits
          await delay(backoffFor(attempt, transient))
        }
      }
      throw new LlmError(
        `LLM "${optsIn.label}" failed after ${attempts} attempts (last error: ${lastError}; last raw: ${truncate(lastRaw, 300)})`,
      )
    },
  }
}
