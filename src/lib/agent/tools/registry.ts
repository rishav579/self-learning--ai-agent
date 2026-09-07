/**
 * Tool registry: the ONLY sanctioned way for the agent to act.
 *  - strict allowlist (unknown tool names are rejected)
 *  - zod arg validation before execution
 *  - per-tool timeout, output truncation
 *  - every call is persisted as a ToolExecution row + console log
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { truncate } from '@/lib/llm'
import type { ToolResult, ToolSpec } from '../types'
import { calculate, CalcError } from './calculator'
import { executeCode } from './code-executor'
import { listSandboxFiles, readSandboxFile } from './file-inspector'
import { WebSearchArgsSchema, webSearch } from './web-search'
import { httpGet } from './http-get'

export interface ToolDefinition {
  name: string
  description: string
  argsShape: string
  argsSchema: z.ZodType<unknown>
  timeoutMs: number
  execute: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult
}

// ---------------------------------------------------------------------------
// Tool definitions (allowlist)
// ---------------------------------------------------------------------------

const tools: Record<string, ToolDefinition> = {
  calculator: {
    name: 'calculator',
    description:
      'Evaluates an arithmetic expression exactly, with full operator precedence. Supports + - * / % ^, parentheses and decimals.',
    argsShape: '{"expression": "8347 * 2953"}',
    argsSchema: z.object({ expression: z.string().trim().min(1).max(500) }),
    timeoutMs: 2000,
    execute: (args) => {
      const { expression } = args as { expression: string }
      try {
        const value = calculate(expression)
        return {
          success: true,
          output: `${expression} = ${value}`,
          data: { value },
        }
      } catch (e) {
        return { success: false, output: '', error: e instanceof CalcError ? e.message : (e as Error).message }
      }
    },
  },
  code_executor: {
    name: 'code_executor',
    description:
      'Runs a snippet of JavaScript in an isolated sandbox (no filesystem, no network, no require). Use it for exact computations, string processing, or algorithms. Capture output with console.log(). Execution time is capped at 2 seconds.',
    argsShape: '{"code": "const fib = n => n < 2 ? n : fib(n-1) + fib(n-2); console.log(fib(15));"}',
    argsSchema: z.object({ code: z.string().trim().min(1).max(5000) }),
    timeoutMs: 5000,
    execute: (args) => {
      const { code } = args as { code: string }
      return executeCode(code)
    },
  },
  file_inspector: {
    name: 'file_inspector',
    description:
      'Reads a file from the agent sandbox (read-only, restricted to the sandbox directory). Use list_files first to discover what exists. Supports plain text files up to 100KB.',
    argsShape: '{"path": "notes.txt"}',
    argsSchema: z.object({ path: z.string().trim().min(1).max(200) }),
    timeoutMs: 4000,
    execute: async (args) => {
      const { path } = args as { path: string }
      try {
        const content = await readSandboxFile(path)
        return { success: true, output: content }
      } catch (e) {
        return { success: false, output: '', error: `file_inspector failed: ${(e as Error).message}` }
      }
    },
  },
  list_files: {
    name: 'list_files',
    description: 'Lists all files in the agent sandbox (relative paths). Takes no arguments.',
    argsShape: '{}',
    argsSchema: z.object({}).strict(),
    timeoutMs: 4000,
    execute: async () => {
      try {
        const files = await listSandboxFiles()
        if (files.length === 0) return { success: true, output: '(sandbox is empty)' }
        return { success: true, output: files.join('\n'), data: { files } }
      } catch (e) {
        return { success: false, output: '', error: `list_files failed: ${(e as Error).message}` }
      }
    },
  },
  web_search: {
    name: 'web_search',
    description:
      'Searches the public web and returns ranked result titles + snippets. Useful for facts you are unsure about. Not for arithmetic or file reading.',
    argsShape: '{"query": "current stable version of node.js", "num": 5}',
    argsSchema: WebSearchArgsSchema,
    timeoutMs: 30_000,
    execute: async (args) => {
      const { query, num } = args as { query: string; num?: number }
      return webSearch(query, num ?? 5)
    },
  },
  http_get: {
    name: 'http_get',
    description:
      'Performs a GET request to a public http/https URL (private/internal addresses are blocked) and returns status + response body (truncated). Use for public JSON/text APIs.',
    argsShape: '{"url": "https://api.github.com/zen"}',
    argsSchema: z.object({ url: z.string().trim().min(8).max(500) }),
    timeoutMs: 20_000,
    execute: async (args) => {
      const { url } = args as { url: string }
      return httpGet(url)
    },
  },
}

export const TOOL_NAMES = Object.keys(tools)

export function getToolCatalog(): ToolSpec[] {
  return TOOL_NAMES.map((name) => ({
    name,
    description: tools[name].description,
    argsShape: tools[name].argsShape,
  }))
}

export function toolExists(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(tools, name)
}

const MAX_LOGGED_OUTPUT = 4000

/**
 * Execute a tool call with full validation, timeout, persistence and logging.
 */
export async function executeToolCall(
  taskId: string,
  toolName: string,
  rawArgs: unknown,
): Promise<ToolResult & { durationMs: number; validatedArgs: Record<string, unknown> }> {
  const t0 = Date.now()
  const def = tools[toolName]
  if (!def) {
    await persist(taskId, toolName, {}, { success: false, output: '', error: `Unknown tool "${toolName}" (not in allowlist)` }, Date.now() - t0)
    return {
      success: false,
      output: '',
      error: `Unknown tool "${toolName}". Allowed tools: ${TOOL_NAMES.join(', ')}`,
      durationMs: Date.now() - t0,
      validatedArgs: {},
    }
  }
  let validated: Record<string, unknown>
  const parsed = def.argsSchema.safeParse(rawArgs ?? {})
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    const error = `Invalid arguments for ${toolName}: ${issues}`
    await persist(taskId, toolName, rawArgs ?? {}, { success: false, output: '', error }, Date.now() - t0)
    return { success: false, output: '', error, durationMs: Date.now() - t0, validatedArgs: {} }
  }
  validated = (parsed.data ?? {}) as Record<string, unknown>

  let result: ToolResult
  try {
    result = await Promise.race([
      Promise.resolve(def.execute(validated)),
      new Promise<ToolResult>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool "${toolName}" timed out after ${def.timeoutMs}ms`)), def.timeoutMs),
      ),
    ])
  } catch (e) {
    result = { success: false, output: '', error: `Tool "${toolName}" crashed: ${(e as Error).message}`.slice(0, 300) }
  }

  const durationMs = Date.now() - t0
  const finalResult: ToolResult = {
    ...result,
    output: truncate(result.output ?? '', MAX_LOGGED_OUTPUT),
  }
  await persist(taskId, toolName, validated, finalResult, durationMs)
  return { ...finalResult, durationMs, validatedArgs: validated }
}

async function persist(
  taskId: string,
  tool: string,
  args: unknown,
  result: ToolResult,
  durationMs: number,
): Promise<void> {
  try {
    await db.toolExecution.create({
      data: {
        taskId,
        tool,
        args: JSON.stringify(args),
        result: JSON.stringify({ success: result.success, output: result.output, error: result.error }),
        success: result.success,
        durationMs,
        error: result.error ?? null,
      },
    })
    logger.info(`tool:${tool}`, { taskId, success: result.success, durationMs })
  } catch (e) {
    // tool logging must never break the agent loop
    logger.error('tool:persist-failed', { taskId, tool, error: (e as Error).message })
  }
}
