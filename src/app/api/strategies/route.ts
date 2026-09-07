import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const strategies = await db.strategy.findMany({ orderBy: { uses: 'desc' } })
    return NextResponse.json({
      strategies: strategies.map((s) => ({
        ...s,
        successRate: s.uses > 0 ? Math.round((s.successes / s.uses) * 1000) / 1000 : 0,
        meanScore: s.uses > 0 ? Math.round((s.totalScore / s.uses) * 1000) / 1000 : 0,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: `Failed to load strategies: ${(e as Error).message}` }, { status: 500 })
  }
}
