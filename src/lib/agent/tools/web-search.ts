/**
 * Web search tool — backed by the z-ai-web-dev-sdk server-side function API.
 * Results are truncated snippets only (no full page fetch here).
 */
import { z } from 'zod'
import type { ToolResult } from '../types'

export const WebSearchArgsSchema = z.object({
  query: z.string().trim().min(2).max(300),
  num: z.coerce.number().int().min(1).max(8).optional(),
})

export async function webSearch(query: string, num = 5): Promise<ToolResult> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const results = await zai.functions.invoke('web_search', { query, num })
    if (!Array.isArray(results) || results.length === 0) {
      return { success: true, output: 'No results found.', data: [] }
    }
    const lines = results.map(
      (r: { name?: string; url?: string; snippet?: string; host_name?: string }, i: number) =>
        `${i + 1}. ${r.name ?? '(untitled)'} [${r.host_name ?? r.url ?? ''}]\n   ${(r.snippet ?? '').slice(0, 300)}`,
    )
    return {
      success: true,
      output: lines.join('\n').slice(0, 6000),
      data: results.slice(0, num),
    }
  } catch (e) {
    return { success: false, output: '', error: `Web search failed: ${(e as Error).message}`.slice(0, 300) }
  }
}
