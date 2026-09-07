/**
 * GET-only HTTP fetch tool with basic SSRF protection:
 *   - only public http/https URLs (no localhost / private / link-local IPs)
 *   - DNS resolved and every resolved address checked against private ranges
 *     BEFORE the request is issued
 *   - manual redirects (max 2), each re-validated
 *   - hard timeout + response size cap
 * Residual risk (documented honestly in README): TOCTOU/DNS-rebinding is not
 * fully mitigated; this is an MVP guard, not a corporate-grade egress proxy.
 */
import dns from 'node:dns/promises'
import net from 'node:net'
import type { ToolResult } from '../types'

const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 2
const MAX_BYTES = 512 * 1024
const MAX_RETURN_CHARS = 6000
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    return false
  }
  // IPv6
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fe80')) return true // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique local
  if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7)) // IPv4-mapped
  return false
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (!hostname) throw new Error('Missing hostname')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.internal') || hostname.endsWith('.local')) {
    throw new Error('Local/internal hostnames are not allowed')
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('Private IP addresses are not allowed')
    return
  }
  const addresses = await dns.lookup(hostname, { all: true })
  if (addresses.length === 0) throw new Error(`DNS resolution failed for ${hostname}`)
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new Error(`Host resolves to a private address (${address}) — blocked`)
    }
  }
}

function validateUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Invalid URL')
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Only http/https are allowed (got ${url.protocol})`)
  }
  if (url.username || url.password) throw new Error('URLs with credentials are not allowed')
  return url
}

export async function httpGet(rawUrl: string): Promise<ToolResult> {
  try {
    let currentUrl = validateUrl(rawUrl)
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
      await assertPublicHost(currentUrl.hostname)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      let res: Response
      try {
        res = await fetch(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'user-agent': 'self-improving-agent-mvp/1.0', accept: 'text/html,application/json,text/plain,*/*' },
        })
      } finally {
        clearTimeout(timer)
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) throw new Error(`Redirect without Location header (status ${res.status})`)
        currentUrl = validateUrl(new URL(loc, currentUrl).toString())
        continue
      }
      // stream-read with a size cap
      const reader = res.body?.getReader()
      let text = ''
      if (reader) {
        const chunks: Uint8Array[] = []
        let total = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          total += value.byteLength
          if (total > MAX_BYTES) {
            await reader.cancel()
            throw new Error(`Response exceeds ${MAX_BYTES} bytes`)
          }
          chunks.push(value)
        }
        const blob = new Blob(chunks as BlobPart[])
        text = await blob.text()
      }
      const contentType = res.headers.get('content-type') ?? ''
      const truncated = text.length > MAX_RETURN_CHARS ? text.slice(0, MAX_RETURN_CHARS) + '…[truncated]' : text
      const output = `HTTP ${res.status} ${res.statusText} (${contentType})\n\n${truncated}`
      return { success: res.ok, output, data: { status: res.status, contentType } }
    }
    throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`)
  } catch (e) {
    const msg = (e as Error).name === 'AbortError' ? `Request timed out after ${TIMEOUT_MS}ms` : (e as Error).message
    return { success: false, output: '', error: `HTTP GET failed: ${msg}`.slice(0, 300) }
  }
}
