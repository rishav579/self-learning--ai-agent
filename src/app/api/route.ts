import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ACTIVE_TASK_STATUSES } from '@/lib/agent/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [tasks, lessons, experiences, strategies, running] = await Promise.all([
      db.task.count(),
      db.lesson.count(),
      db.experience.count(),
      db.strategy.count(),
      db.task.count({ where: { status: { in: [...ACTIVE_TASK_STATUSES] } } }),
    ])
    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      counts: { tasks, lessons, experiences, strategies, activeTasks: running },
      time: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json(
      { status: 'degraded', database: 'error', error: (e as Error).message },
      { status: 503 },
    )
  }
}
