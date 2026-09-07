import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function safeJson(s: string | null | undefined): unknown {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get('limit') ?? 100) || 100, 500)
    const [lessons, experiences, counts] = await Promise.all([
      db.lesson.findMany({ orderBy: [{ useCount: 'desc' }, { updatedAt: 'desc' }], take: limit }),
      db.experience.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
      Promise.all([db.lesson.count(), db.experience.count()]),
    ])
    return NextResponse.json({
      counts: { lessons: counts[0], experiences: counts[1] },
      lessons: lessons.map((l) => ({ ...l, keywords: safeJson(l.keywords) })),
      experiences: experiences.map((e) => ({
        ...e,
        actionsSummary: safeJson(e.actionsSummary),
        keywords: safeJson(e.keywords),
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: `Failed to load memory: ${(e as Error).message}` }, { status: 500 })
  }
}

/**
 * Reset memory (lessons, experiences, strategies) so the learning loop can
 * be demonstrated from a clean slate. Tasks keep their rows but detached.
 */
export async function DELETE() {
  try {
    const deleted = await db.$transaction([
      db.experience.deleteMany({}),
      db.lesson.deleteMany({}),
      db.strategy.deleteMany({}),
    ])
    return NextResponse.json({
      deleted: {
        experiences: deleted[0].count,
        lessons: deleted[1].count,
        strategies: deleted[2].count,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: `Failed to reset memory: ${(e as Error).message}` }, { status: 500 })
  }
}
