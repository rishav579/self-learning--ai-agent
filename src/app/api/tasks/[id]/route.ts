import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { safeJson } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const task = await db.task.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        toolExecutions: { orderBy: { createdAt: 'asc' } },
        evaluations: true,
        experiences: { orderBy: { createdAt: 'desc' } },
        lessonsCreated: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    return NextResponse.json({
      task: {
        ...task,
        understanding: safeJson(task.understanding),
        plan: safeJson(task.plan),
        checks: safeJson(task.checks),
        retrievedMemory: safeJson(task.retrievedMemory),
        selectedStrategy: safeJson(task.selectedStrategy),
        experiences: task.experiences.map((e) => ({
          ...e,
          actionsSummary: safeJson(e.actionsSummary),
          keywords: safeJson(e.keywords),
        })),
        lessonsCreated: task.lessonsCreated.map((l) => ({ ...l, keywords: safeJson(l.keywords) })),
        evaluations: task.evaluations.map((e) => ({ ...e, checks: safeJson(e.checks) })),
        events: task.events.map((e) => ({ ...e, payload: safeJson(e.payload) })),
        toolExecutions: task.toolExecutions.map((t) => ({
          ...t,
          args: safeJson(t.args),
          result: safeJson(t.result),
        })),
      },
    })
  } catch (e) {
    return NextResponse.json({ error: `Failed to load task: ${(e as Error).message}` }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const task = await db.task.findUnique({ where: { id }, select: { status: true } })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    if (!['pending', 'completed', 'failed'].includes(task.status)) {
      return NextResponse.json({ error: 'Cannot delete a task while it is running' }, { status: 409 })
    }
    await db.task.delete({ where: { id } })
    return NextResponse.json({ deleted: true })
  } catch (e) {
    return NextResponse.json({ error: `Failed to delete: ${(e as Error).message}` }, { status: 500 })
  }
}
