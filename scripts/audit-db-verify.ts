// Release audit: verify DB benchmark records match README claims (read-only)
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL || "file:./db/custom.db" } } });

const runs = await db.benchmarkRun.findMany({
  orderBy: { createdAt: "asc" },
  select: { id: true, taskSet: true, status: true, error: true, createdAt: true, updatedAt: true, modes: true },
});

console.log(`BenchmarkRun rows: ${runs.length}`);
for (const r of runs) {
  console.log(
    `- id=${r.id.slice(0, 8)} taskSet=${r.taskSet} status=${r.status} modes=${r.modes} created=${r.createdAt?.toISOString()} updated=${r.updatedAt?.toISOString()} error=${r.error ?? "—"}`
  );
}

// Full per-mode results from the most recent completed run
const completed = runs.filter((r) => r.status === "completed");
if (completed.length) {
  const last = completed[completed.length - 1];
  const detail = await db.benchmarkRun.findUnique({ where: { id: last.id }, select: { results: true, taskSet: true } });
  console.log(`\n=== per-mode detail: latest completed run (${last.taskSet}, id=${last.id.slice(0, 8)}) ===`);
  const parsed = JSON.parse(detail?.results ?? "{}");
  for (const [mode, agg] of Object.entries(parsed)) {
    const a = agg as any;
    const perTask = Array.isArray(a?.perTask) ? a.perTask : [];
    console.log(
      `  mode ${mode}: meanScore=${a?.meanScore ?? "?"} successRate=${a?.successRate ?? "?"} tasks=${perTask.length}`
    );
    for (const t of perTask) {
      console.log(`    - ${String(t?.title ?? "").slice(0, 48)} score=${t?.score} success=${t?.success} llmCalls=${t?.llmCalls}`);
    }
  }
}

const taskCount = await db.task.count();
const lessonCount = await db.lesson.count();
const expCount = await db.experience.count();
console.log(`\nTask rows: ${taskCount}, Lesson rows: ${lessonCount}, Experience rows: ${expCount}`);

// Check for any completed task containing the ANSWER: convention (v2 live-run evidence)
const v2Evidence = await db.task.findMany({
  where: { input: { contains: "ANSWER" } },
  select: { id: true, input: true, score: true, status: true },
});
console.log(`Tasks whose INPUT mentions ANSWER (v2 trap wording): ${v2Evidence.length}`);
for (const t of v2Evidence.slice(0, 5)) console.log(`  - ${t.id.slice(0, 8)} status=${t.status} score=${t.score}`);

await db.$disconnect();
