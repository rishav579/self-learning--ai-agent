/**
 * Sandboxed JS code executor using node:vm — HARDENED.
 *
 * SECURITY HISTORY (found by adversarial testing, fixed 2026-09):
 * The first version injected HOST-realm builtins (Object, Array, Math, …)
 * into the sandbox and used a plain `{}` sandbox object. Under Bun, the
 * contextified global then keeps a path to the HOST Function constructor:
 *   this.constructor.constructor('return process')()   // ← real escape
 * which compiles in the HOST realm, where `codeGeneration: {strings:false}`
 * does not apply → arbitrary host code execution. We verified the escape
 * empirically before fixing it.
 *
 * Hardening applied (each layer independently blocks the known vectors):
 *   1. The sandbox object is created with `Object.create(null)` — the
 *      contextified global has no host prototype chain.
 *   2. NO host-realm objects are injected. A fresh vm context has its own
 *      Object/Array/JSON/Math/… intrinsics, so the agent never gets host
 *      references. Only a null-prototype logging callback crosses the
 *      boundary, and `console` itself is built INSIDE the context.
 *   3. `Object.setPrototypeOf(globalThis, null)` runs inside the context
 *      before user code, so `this.constructor` / `globalThis.constructor`
 *      resolve to undefined.
 *   4. `codeGeneration: { strings: false, wasm: false }` blocks eval and the
 *      context's own Function constructor.
 *   5. Execution timeout + code size + output caps (unchanged).
 *
 * HONEST LIMITATION: node:vm is still not a cryptographic security boundary
 * (per Node.js docs). This hardening blocks every escape vector we know of
 * and could test, but a defense-in-depth production deployment should run
 * untrusted code in a separate process (or worker/isolate) with resource
 * limits. See README "Security limitations".
 */
import vm from 'node:vm'
import type { ToolResult } from '../types'

const MAX_CODE_LENGTH = 5000
const TIMEOUT_MS = 2000
const MAX_OUTPUT_CHARS = 8000
const MAX_LOGS = 50

export function executeCode(code: string): ToolResult {
  if (typeof code !== 'string' || code.trim().length === 0) {
    return { success: false, output: '', error: 'No code provided' }
  }
  if (code.length > MAX_CODE_LENGTH) {
    return { success: false, output: '', error: `Code exceeds ${MAX_CODE_LENGTH} characters` }
  }
  const logs: string[] = []
  // host logging callback with a SEVERED prototype chain: a null-prototype
  // function is still callable but exposes no .constructor path back to the
  // host Function constructor.
  const capture = (...args: unknown[]) => {
    if (logs.length < MAX_LOGS) logs.push(args.map(fmt).join(' '))
  }
  Object.setPrototypeOf(capture, null)

  // null-prototype sandbox: the ONLY host reference that crosses the
  // boundary is `__capture` (null-prototype itself)
  const sandbox: Record<string, unknown> = Object.create(null)
  sandbox.__capture = capture
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } })

  // harden from inside: sever the global's prototype, build `console` from
  // context-native objects, then remove the raw bridge binding
  try {
    vm.runInContext(
      'Object.setPrototypeOf(globalThis, null); console = { log: __capture }; delete globalThis.__capture',
      context,
      { timeout: 200 },
    )
  } catch (e) {
    // fail CLOSED: if hardening cannot be applied, do not run user code
    return { success: false, output: '', error: `Sandbox hardening failed: ${(e as Error).message}` }
  }

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
