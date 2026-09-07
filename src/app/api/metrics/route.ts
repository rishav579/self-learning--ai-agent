import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/**
 * Improvement metrics over the task sequence (mode `full` by default):
 *  - score trend per task (chronological)
 *  - first-half vs second-half mean (improvement delta)
 *  - success counts, lesson stats, strategy summary
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') ?? 'full'
    const tasks = await db.task.findMany({
      where: { mode, status: 'completed' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, score: true, success: true, createdAt: true, strategyName: true },
    })
    const scores = tasks.map((t) => t.score ?? 0)
    const half = Math.floor(scores.length / 2)
    const mean = (arr: number[]) => (arr.length > 0 ? round3(arr.reduce((s, v) => s + v, 0) / arr.length) : null)
    const firstHalf = mean(scores.slice(0, half))
    const secondHalf = mean(scores.slice(half))
    const improvement = firstHalf !== null && secondHalf !== null ? round3(secondHalf - firstHalf) : null

    const [lessonStats, experienceCount, strategyCount, statusBreakdown] = await Promise.all([
      db.lesson.findMany({ orderBy: { useCount: 'desc' }, take: 5, select: { id: true, content: true, type: true, confidence: true, useCount: true, helpfulCount: true, notHelpfulCount: true } }),
      db.experience.count(),
      db.strategy.count(),
      db.task.groupBy({ by: ['status'], _count: { _all: true } }),
    ])

    return NextResponse.json({
      mode,
      sequence: tasks.map((t, i) => ({
        index: i + 1,
        id: t.id,
        title: t.title,
        score: round3(t.score ?? 0),
        success: t.success,
        strategy: t.strategyName,
        at: t.createdAt,
      })),
      summary: {
        completedTasks: tasks.length,
        meanScore: mean(scores),
        successRate: tasks.length > 0 ? round3(tasks.filter((t) => t.success).length / tasks.length) : null,
        firstHalfMean: firstHalf,
        secondHalfMean: secondHalf,
        improvement: improvement,
      },
      topLessons: lessonStats.map((l) => ({
        ...l,
        helpfulRate: l.useCount > 0 ? round3(l.helpfulCount / l.useCount) : null,
      })),
      memorySize: { experiences: experienceCount, strategies: strategyCount },
      statusBreakdown: statusBreakdown.map((s) => ({ status: s.status, count: s._count._all })),
    })
  } catch (e) {
    return NextResponse.json({ error: `Failed to compute metrics: ${(e as Error).message}` }, { status: 500 })
  }
}
