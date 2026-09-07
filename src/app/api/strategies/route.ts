import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { round3 } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const strategies = await db.strategy.findMany({ orderBy: { uses: 'desc' } })
    return NextResponse.json({
      strategies: strategies.map((s) => ({
        ...s,
        successRate: s.uses > 0 ? round3(s.successes / s.uses) : 0,
        meanScore: s.uses > 0 ? round3(s.totalScore / s.uses) : 0,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: `Failed to load strategies: ${(e as Error).message}` }, { status: 500 })
  }
}
