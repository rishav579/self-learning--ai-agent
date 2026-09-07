/**
 * LLM client wrapper with:
 *  - cached ZAI singleton (real backend, server-side only)
 *  - structured JSON output validated against zod schemas
 *  - retries with error feedback, per-call timeout, hard failure errors
 *  - an injectable interface so tests can mock the LLM entirely
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

export interface LlmClient {
  chat(messages: ChatMsg[], opts?: { timeoutMs?: number; label?: string }): Promise<string>
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
// Real implementation (z-ai-web-dev-sdk, server only)
// ---------------------------------------------------------------------------

async function loadSdk() {
  const mod = (await import('z-ai-web-dev-sdk')).default
  return mod.create()
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Detect rate-limit / transient server errors that are worth backing off for. */
function isTransientError(message: string): boolean {
  return /429|too many requests|rate ?limit|overloaded|503|502|timeout|timed out|network/i.test(message)
}

/**
 * Aggressive backoff for rate limits: 10s, 20s, 40s, capped 60s.
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

export function createLlmClient(): LlmClient {
  return {
    async chat(messages: ChatMsg[], opts?: { timeoutMs?: number; label?: string }): Promise<string> {
      const timeoutMs = opts?.timeoutMs ?? 90_000
      const label = opts?.label ?? 'chat'
      const t0 = Date.now()
      try {
        const zai = await getZai()
        const completion = await withTimeout(
          paced(() =>
            zai.chat.completions.create({
              messages,
              thinking: { type: 'disabled' },
            }),
          ),
          timeoutMs,
          label,
        )
        const content: string | undefined = completion?.choices?.[0]?.message?.content
        if (typeof content !== 'string') {
          throw new LlmError(`LLM "${label}" returned no content`)
        }
        logger.debug(`llm:${label}`, { ms: Date.now() - t0, chars: content.length })
        return content
      } catch (e) {
        logger.warn(`llm:${label}:failed`, { ms: Date.now() - t0, error: (e as Error).message })
        throw e instanceof LlmError ? e : new LlmError(`LLM "${label}" failed: ${(e as Error).message}`)
      }
    },

    async chatJson<T>(opts: ChatJsonOptions): Promise<T> {
      const attempts = opts.attempts ?? 4
      const timeoutMs = opts.timeoutMs ?? 120_000
      const schema = opts.schema
      const system = `${opts.system}\n\nCRITICAL OUTPUT RULES:\n- Respond with a SINGLE valid JSON object and NOTHING else.\n- No prose, no markdown, no code fences.\n- Your entire response must be parseable by JSON.parse.`
      let lastError = ''
      let lastRaw = ''
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const feedback =
          attempt > 1 && lastError
            ? `\n\nYour previous response was INVALID.\nPrevious response (truncated): ${truncate(lastRaw, 800)}\nValidation error: ${lastError}\nFix it and respond with a single valid JSON object only.`
            : ''
        const prompt = `${opts.prompt}\n\nThe JSON object must have this shape:\n${opts.shapeHint}${feedback}`
        const t0 = Date.now()
        try {
          const zai = await getZai()
          const completion = await withTimeout(
            paced(() =>
              zai.chat.completions.create({
                messages: [
                  { role: 'system', content: system },
                  { role: 'user', content: prompt },
                ],
                thinking: { type: 'disabled' },
              }),
            ),
            timeoutMs,
            opts.label,
          )
          const content: string | undefined = completion?.choices?.[0]?.message?.content
          if (typeof content !== 'string' || !content.trim()) {
            throw new LlmError(`LLM "${opts.label}" returned no content`)
          }
          lastRaw = content
          const parsed = extractJson(content)
          const validated = schema.safeParse(parsed)
          if (!validated.success) {
            lastError = validated.error.issues
              .slice(0, 5)
              .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
              .join('; ')
            logger.warn(`llm:${opts.label}:schema-invalid`, { attempt, issues: lastError })
            if (attempt < attempts) await delay(backoffMs(attempt, false))
            continue
          }
          logger.debug(`llm:${opts.label}:ok`, { ms: Date.now() - t0, attempt })
          return validated.data as T
        } catch (e) {
          lastError = (e as Error).message
          const transient = isTransientError(lastError)
          logger.warn(`llm:${opts.label}:attempt-failed`, { attempt, transient, error: truncate(lastError, 200) })
          // If this was the last attempt, rethrow
          if (attempt === attempts) throw e
          // Back off before the next attempt — critical for 429 rate limits
          await delay(backoffMs(attempt, transient))
        }
      }
      throw new LlmError(
        `LLM "${opts.label}" failed after ${attempts} attempts (last error: ${lastError}; last raw: ${truncate(lastRaw, 300)})`,
      )
    },
  }
}
