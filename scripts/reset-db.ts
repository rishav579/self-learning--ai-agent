/**
 * Wipe all runtime data (tasks, memory, benchmark runs) for a clean
 * experiment. Run: bun run scripts/reset-db.ts
 */
import path from 'node:path'

const dbPath = path.resolve(process.cwd(), 'db/custom.db')
process.env.DATABASE_URL = process.env.DATABASE_URL || `file:${dbPath}`

import { db } from '@/lib/db'

async function main() {
  const deleted = await db.$transaction([
    db.agentEvent.deleteMany({}),
    db.toolExecution.deleteMany({}),
    db.evaluation.deleteMany({}),
    db.experience.deleteMany({}),
    db.lesson.deleteMany({}),
    db.strategy.deleteMany({}),
    db.task.deleteMany({}),
    db.benchmarkRun.deleteMany({}),
  ])
  console.log(
    'reset:',
    JSON.stringify({
      events: deleted[0].count,
      toolExecutions: deleted[1].count,
      evaluations: deleted[2].count,
      experiences: deleted[3].count,
      lessons: deleted[4].count,
      strategies: deleted[5].count,
      tasks: deleted[6].count,
      benchmarkRuns: deleted[7].count,
    }),
  )
}

main()
  .catch((e) => {
    console.error('reset failed:', e.message)
    process.exit(1)
  })
  .then(() => process.exit(0))
