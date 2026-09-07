/**
 * Sandboxed JS code executor using node:vm.
 * NOTE (honest security statement): node:vm is an isolation mechanism, not a
 * hard security boundary against a truly hostile actor (per Node.js docs).
 * For this MVP we additionally:
 *   - provide NO require/process/fs/net globals in the sandbox context
 *   - enforce an execution timeout (interrupts infinite loops)
 *   - cap code size and captured output
 * This is sufficient for demonstrating tool use on non-adversarial input.
 */
import vm from 'node:vm'
import type { ToolResult } from '../types'

const MAX_CODE_LENGTH = 5000
const TIMEOUT_MS = 2000
const MAX_OUTPUT_CHARS = 8000

export function executeCode(code: string): ToolResult {
  if (typeof code !== 'string' || code.trim().length === 0) {
    return { success: false, output: '', error: 'No code provided' }
  }
  if (code.length > MAX_CODE_LENGTH) {
    return { success: false, output: '', error: `Code exceeds ${MAX_CODE_LENGTH} characters` }
  }
  const logs: string[] = []
  const sandboxConsole = {
    log: (...args: unknown[]) => {
      if (logs.length < 50) logs.push(args.map(fmt).join(' '))
    },
  }
  const sandbox: Record<string, unknown> = {
    console: sandboxConsole,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Date,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    RegExp,
    Error,
    BigInt,
  }
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } })
  try {
    const script = new vm.Script(code, { filename: 'agent-sandbox.js' })
    const completion = script.runInContext(context, { timeout: TIMEOUT_MS })
    const parts: string[] = []
    if (logs.length > 0) parts.push(logs.join('\n'))
    if (completion !== undefined) {
      parts.push(`=> ${fmt(completion)}`)
    }
    if (parts.length === 0) {
      return { success: true, output: '(no output; code produced no value and logged nothing)' }
    }
    return { success: true, output: parts.join('\n').slice(0, MAX_OUTPUT_CHARS) }
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    return {
      success: false,
      output: logs.join('\n').slice(0, MAX_OUTPUT_CHARS),
      error: `Execution error: ${msg}`.slice(0, 500),
    }
  }
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return String(v)
  }
}
