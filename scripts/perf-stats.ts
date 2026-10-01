import path from 'node:path'

const dbPath = path.resolve(process.cwd(), 'db/custom.db')
process.env.DATABASE_URL = process.env.DATABASE_URL || `file:${dbPath}`
import { db } from '@/lib/db'
async function main() {
  const tasks = await db.task.findMany({
    where: { status: 'completed', benchmarkRunId: { not: null } },
    select: { llmCalls: true, iterations: true, createdAt: true, completedAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const tools = await db.toolExecution.groupBy({ by: ['tool'], _count: { _all: true }, _avg: { durationMs: true } })
  const sample = await db.toolExecution.findMany({ take: 200, orderBy: { createdAt: 'asc' }, select: { tool: true } })
  if (tasks.length === 0) { console.log('no completed benchmark tasks'); return }
  const dur = tasks.map((t) => (t.completedAt?.getTime() ?? 0) - t.createdAt.getTime()).filter((d) => d > 0)
  const llm = tasks.map((t) => t.llmCalls)
  const iters = tasks.map((t) => t.iterations)
  const mean = (a: number[]) => (a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : 0)
  console.log('completed benchmark tasks:', tasks.length)
  console.log('task latency ms: mean', mean(dur), 'min', Math.min(...dur), 'max', Math.max(...dur))
  console.log('LLM calls/task: mean', mean(llm), 'min', Math.min(...llm), 'max', Math.max(...llm))
  console.log('iterations/task: mean', mean(iters), 'max', Math.max(...iters))
  console.log('tool executions:')
  for (const t of tools) console.log(`   ${t.tool}: count=${t._count._all} avgDur=${Math.round(t._avg.durationMs ?? 0)}ms`)
  const retrieval = sample.filter((s) => s.tool === 'list_files')
  console.log('total tool calls (sample):', sample.length)
}
main().then(() => process.exit(0))
