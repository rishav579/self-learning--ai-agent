import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { RunBenchmarkSchema } from '@/lib/agent/schemas'
import { launchBenchmark } from '@/lib/agent/benchmark'
import { safeJson } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const runs = await db.benchmarkRun.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
    return NextResponse.json({
      runs: runs.map((r) => ({
        ...r,
        modes: safeJson(r.modes),
        results: safeJson(r.results),
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: `Failed to load benchmark: ${(e as Error).message}` }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = RunBenchmarkSchema.safeParse(body ?? {})
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
        { status: 400 },
      )
    }
    const { id } = await launchBenchmark({
      taskSet: parsed.data.taskSet ?? 'default',
      modes: parsed.data.modes,
    })
    logger.info('api:benchmark-launched', { runId: id })
    return NextResponse.json({ id, status: 'running' }, { status: 202 })
  } catch (e) {
    const message = (e as Error).message
    if (message.includes('already running')) {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    logger.error('api:benchmark-launch-failed', { error: message })
    return NextResponse.json({ error: 'Failed to launch benchmark' }, { status: 500 })
  }
}
