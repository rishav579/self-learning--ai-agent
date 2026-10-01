// Release audit: verify README's claimed real-LLM learning-loop evidence in AgentEvent timeline
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL || "file:./db/custom.db" } } });

// 1. any lesson_stored / experience_stored / strategy_updated events at all?
const eventTypes = await db.agentEvent.groupBy({ by: ["type"], _count: { _all: true } });
console.log("=== AgentEvent type counts ===");
for (const e of eventTypes.sort((a: any, b: any) => b._count._all - a._count._all)) {
  console.log(`  ${e.type}: ${e._count._all}`);
}

// 2. the full-loop trace: find a task with a lesson_stored event
const lessonEvents = await db.agentEvent.findMany({
  where: { type: "lesson_stored" },
  orderBy: { createdAt: "asc" },
  take: 3,
});
console.log(`\nlesson_stored events: ${lessonEvents.length}`);
for (const e of lessonEvents) {
  console.log(`  task=${e.taskId?.slice(0, 8)} payload=${String(e.payload).slice(0, 220)}`);
}

// 3. strategy events proving calculator_for_multiplication was recorded
const stratEvents = await db.agentEvent.findMany({
  where: { type: "strategy_updated" },
  orderBy: { createdAt: "asc" },
  take: 3,
});
console.log(`\nstrategy_updated events: ${stratEvents.length}`);
for (const e of stratEvents) {
  console.log(`  task=${e.taskId?.slice(0, 8)} payload=${String(e.payload).slice(0, 220)}`);
}

// 4. the cold-start multiplication task's full timeline
if (lessonEvents.length) {
  const tid = lessonEvents[0].taskId;
  const events = await db.agentEvent.findMany({
    where: { taskId: tid },
    orderBy: { createdAt: "asc" },
    select: { type: true, createdAt: true },
  });
  console.log(`\n=== full timeline of the lesson-bearing task ${tid?.slice(0, 8)} ===`);
  console.log(events.map((e) => e.type).join(" → "));
  const t = await db.task.findUnique({ where: { id: tid! }, select: { input: true, score: true, status: true, mode: true } });
  console.log(`task input: ${t?.input?.slice(0, 100)}`);
  console.log(`task score=${t?.score} status=${t?.status} mode=${t?.mode}`);
}

await db.$disconnect();
