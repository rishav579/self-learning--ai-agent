import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { CreateTaskSchema } from '@/lib/agent/schemas'
import { createAndEnqueueTask, runnerStats } from '@/lib/agent/runner'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get('limit') ?? 50) || 50, 200)
    const mode = searchParams.get('mode')
    const tasks = await db.task.findMany({
      where: mode ? { mode } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        input: true,
        mode: true,
        status: true,
        score: true,
        success: true,
        iterations: true,
        llmCalls: true,
        strategyName: true,
        createdAt: true,
        completedAt: true,
        error: true,
      },
    })
    return NextResponse.json({ tasks, runner: runnerStats() })
  } catch (e) {
    logger.error('api:tasks:list-failed', { error: (e as Error).message })
    return NextResponse.json({ error: 'Failed to list tasks' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const parsed = CreateTaskSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
        { status: 400 },
      )
    }
    const { id } = await createAndEnqueueTask({
      title: parsed.data.title,
      input: parsed.data.input,
      checks: parsed.data.checks,
      mode: parsed.data.mode,
    })
    logger.info('api:task-created', { taskId: id, mode: parsed.data.mode ?? 'full' })
    return NextResponse.json({ id, status: 'queued' }, { status: 202 })
  } catch (e) {
    const message = (e as Error).message
    if (message.includes('queue is full') || message.includes('Agent queue')) {
      return NextResponse.json({ error: message }, { status: 429 })
    }
    logger.error('api:task-create-failed', { error: message })
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}
