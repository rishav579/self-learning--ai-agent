import { describe, expect, test, beforeAll } from 'bun:test'
import { db } from '@/lib/db'
import { executeToolCall, toolExists, getToolCatalog, TOOL_NAMES } from '@/lib/agent/tools/registry'

async function cleanDb() {
  await db.task.deleteMany({})
  await db.toolExecution.deleteMany({})
  await db.agentEvent.deleteMany({})
}

beforeAll(cleanDb)

describe('tool registry (allowlist + validation + logging)', () => {
  test('catalog lists all six tools', () => {
    expect(TOOL_NAMES.sort()).toEqual(
      ['calculator', 'code_executor', 'file_inspector', 'http_get', 'list_files', 'web_search'].sort(),
    )
    expect(getToolCatalog().every((t) => t.argsShape.length > 0)).toBe(true)
  })

  test('unknown tool names are rejected (allowlist)', async () => {
    const task = await db.task.create({ data: { title: 'x', input: 'task', mode: 'full' } })
    const r = await executeToolCall(task.id, 'shell_exec', { cmd: 'rm -rf /' })
    expect(r.success).toBe(false)
    expect(r.error).toContain('Unknown tool')
    const log = await db.toolExecution.findFirst({ where: { taskId: task.id, tool: 'shell_exec' } })
    expect(log?.success).toBe(false)
  })

  test('invalid arguments are rejected before execution', async () => {
    const task = await db.task.create({ data: { title: 'x', input: 'task', mode: 'full' } })
    const r = await executeToolCall(task.id, 'calculator', { expression: 12345 }) // wrong type
    expect(r.success).toBe(false)
    expect(r.error).toContain('Invalid arguments')
  })

  test('calculator call executes and is persisted', async () => {
    const task = await db.task.create({ data: { title: 'x', input: 'task', mode: 'full' } })
    const r = await executeToolCall(task.id, 'calculator', { expression: '8347 * 2953' })
    expect(r.success).toBe(true)
    expect(r.output).toContain('24648691')
    const log = await db.toolExecution.findFirst({ where: { taskId: task.id, tool: 'calculator' } })
    expect(log?.success).toBe(true)
    expect(log?.args).toContain('8347')
  })

  test('toolExists works', () => {
    expect(toolExists('calculator')).toBe(true)
    expect(toolExists('rm')).toBe(false)
  })

  test('code_executor call is logged with duration', async () => {
    const task = await db.task.create({ data: { title: 'x', input: 'task', mode: 'full' } })
    const r = await executeToolCall(task.id, 'code_executor', { code: 'console.log(1+1)' })
    expect(r.success).toBe(true)
    expect(r.output).toContain('2')
    const log = await db.toolExecution.findFirst({ where: { taskId: task.id, tool: 'code_executor' } })
    expect(log && log.durationMs >= 0).toBe(true)
  })
})
