/**
 * Structured console logging for the agent runtime.
 * - Always includes a stable tag so dev.log is greppable
 * - Never logs secrets or full LLM payloads (only sizes/durations/summaries)
 */

type Level = 'debug' | 'info' | 'warn' | 'error'

function emit(level: Level, tag: string, data?: Record<string, unknown>) {
  const line = [`[${level}] [${tag}]`]
  if (data && Object.keys(data).length > 0) {
    try {
      line.push(JSON.stringify(scrub(data)))
    } catch {
      line.push('[unserializable]')
    }
  }
  const msg = line.join(' ')
  switch (level) {
    case 'debug':
      console.log(msg)
      break
    case 'info':
      console.log(msg)
      break
    case 'warn':
      console.warn(msg)
      break
    case 'error':
      console.error(msg)
      break
  }
}

/** Remove anything that looks like a secret from logs. */
const SECRET_KEY_RE = /(api[_-]?key|token|secret|password|authorization|credential)/i
function scrub(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (SECRET_KEY_RE.test(k)) {
      out[k] = '***'
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = scrub(v as Record<string, unknown>)
    } else {
      out[k] = v
    }
  }
  return out
}

export const logger = {
  debug: (tag: string, data?: Record<string, unknown>) => emit('debug', tag, data),
  info: (tag: string, data?: Record<string, unknown>) => emit('info', tag, data),
  warn: (tag: string, data?: Record<string, unknown>) => emit('warn', tag, data),
  error: (tag: string, data?: Record<string, unknown>) => emit('error', tag, data),
}
