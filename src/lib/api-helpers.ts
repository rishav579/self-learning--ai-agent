/**
 * Small shared helpers for API routes (JSON column parsing).
 */
export function safeJson(s: string | null | undefined): unknown {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
