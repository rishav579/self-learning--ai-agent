/**
 * Small shared helpers for API routes and the benchmark runner
 * (JSON column parsing + numeric rounding).
 */
export function safeJson(s: string | null | undefined): unknown {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** Round to 3 decimals — keeps stored/returned metrics stable. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
