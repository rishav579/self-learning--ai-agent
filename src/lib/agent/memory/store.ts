/**
 * Memory persistence:
 *  - storeExperience: one row per completed task (near-duplicates MERGED
 *    so repeated identical tasks cannot flood memory)
 *  - storeLesson: dedup-aware lesson upsert (near-duplicates are merged)
 *  - recordLessonUsage: tracks whether retrieved lessons actually helped,
 *    and RETIRES lessons that are repeatedly unhelpful (poisoning safeguard)
 *  - updateStrategyStats: strategy success accounting
 */
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { Reflection, StrategyStats } from '../types'
import { cosineSimilarity, jaccardSimilarity, tokenize } from './retrieval'

export interface StoreExperienceInput {
  taskId: string
  taskSummary: string
  category: string
  context: string
  actionsSummary: string[]
  outcome: string
  score: number
  success: boolean
  successfulApproach?: string | null
  failedApproach?: string | null
  strategyName?: string | null
  lessonId?: string | null
  keywords: string[]
}

/**
 * Near-identical task summaries (same category, similarity >= 0.9) are
 * treated as the SAME experience: we keep ONE row and refresh its outcome,
 * so "run the same task 20 times" does not create 20 rows.
 */
const EXPERIENCE_DEDUP_SIMILARITY = 0.9

export async function storeExperience(input: StoreExperienceInput) {
  const summaryTokens = tokenize(input.taskSummary)
  const candidates = await db.experience.findMany({
    where: { category: input.category || 'general' },
    take: 100,
    orderBy: { createdAt: 'desc' },
    select: { id: true, taskSummary: true },
  })
  let duplicate: { id: string } | null = null
  for (const c of candidates) {
    if (cosineSimilarity(summaryTokens, tokenize(c.taskSummary)) >= EXPERIENCE_DEDUP_SIMILARITY) {
      duplicate = { id: c.id }
      break
    }
  }

  // shared field set: the merge branch only swaps which row it lands in
  // (and keeps the original taskSummary of the first occurrence)
  const data = {
    context: input.context.slice(0, 1000),
    actionsSummary: JSON.stringify(input.actionsSummary.slice(0, 20)),
    outcome: input.outcome.slice(0, 1000),
    score: input.score,
    success: input.success,
    successfulApproach: input.successfulApproach?.slice(0, 800) ?? null,
    failedApproach: input.failedApproach?.slice(0, 800) ?? null,
    strategyName: input.strategyName ?? null,
    lessonId: input.lessonId ?? null,
    keywords: JSON.stringify(input.keywords.slice(0, 12)),
  }

  if (duplicate) {
    // merge: refresh outcome/score on the existing row instead of creating
    // a near-copy (the latest run is the most representative)
    const merged = await db.experience.update({
      where: { id: duplicate.id },
      data: {
        taskId: input.taskId,
        ...data,
      },
    })
    logger.info('memory:experience-merged', { taskId: input.taskId, experienceId: merged.id })
    return merged
  }

  return db.experience.create({
    data: {
      taskId: input.taskId,
      taskSummary: input.taskSummary.slice(0, 500),
      category: input.category || 'general',
      ...data,
    },
  })
}

export interface StoreLessonResult {
  lessonId: string
  deduplicated: boolean
  similarity: number
}

const DEDUP_SIMILARITY = 0.72

/**
 * Store a lesson extracted from reflection, merging near-duplicates instead
 * of creating redundant rows ("memory should be useful, not bloated").
 */
export async function storeLesson(
  reflection: Reflection,
  category: string,
  sourceTaskId: string,
): Promise<StoreLessonResult> {
  const content = reflection.lesson.content
  const contentTokens = tokenize(content)
  const candidates = await db.lesson.findMany({
    where: { category },
    take: 200,
    orderBy: { updatedAt: 'desc' },
  })

  let best: (typeof candidates)[number] | null = null
  let bestSim = 0
  for (const c of candidates) {
    const sim = Math.max(cosineSimilarity(contentTokens, tokenize(c.content)), jaccardSimilarity(contentTokens, tokenize(c.content)))
    if (!best || sim > bestSim) {
      best = c
      bestSim = sim
    }
  }

  if (best && bestSim >= DEDUP_SIMILARITY) {
    // Merge: reinforce confidence, keep the more specific content, bump stats.
    // `best` is already the full lesson row — no second fetch needed.
    const existing = best
    const newConfidence = Math.min(1, Math.max(existing.confidence, reflection.lesson.confidence) + 0.05)
    let mergedKeywords: string[]
    try {
      mergedKeywords = Array.isArray(JSON.parse(existing.keywords || '[]')) ? JSON.parse(existing.keywords) : []
    } catch {
      mergedKeywords = [] // corrupted keywords field — recover by replacing
    }
    mergedKeywords = Array.from(new Set([...mergedKeywords, ...reflection.lesson.keywords])).slice(0, 12)
    await db.lesson.update({
      where: { id: existing.id },
      data: {
        confidence: newConfidence,
        refinements: { increment: 1 },
        keywords: JSON.stringify(mergedKeywords),
        strategyName: reflection.lesson.strategyName ?? existing.strategyName,
        updatedAt: new Date(),
        // a reinforced lesson gets a fresh chance even if it was retired
        // (the new evidence may supersede the old failure statistics)
        retired: false,
      },
    })
    logger.info('memory:lesson-merged', { taskId: sourceTaskId, lessonId: existing.id, similarity: Math.round(bestSim * 100) / 100 })
    return { lessonId: existing.id, deduplicated: true, similarity: bestSim }
  }

  const lesson = await db.lesson.create({
    data: {
      content,
      type: reflection.lesson.type,
      confidence: Math.min(1, Math.max(0, reflection.lesson.confidence)),
      strategyName: reflection.lesson.strategyName,
      category: category || 'general',
      keywords: JSON.stringify(reflection.lesson.keywords.slice(0, 12)),
      sourceTaskId,
    },
  })
  logger.info('memory:lesson-stored', { taskId: sourceTaskId, lessonId: lesson.id })
  return { lessonId: lesson.id, deduplicated: false, similarity: bestSim }
}

/**
 * A lesson is retired when it has been retrieved enough times to judge it
 * (>= RETIRE_MIN_USES) and been clearly unhelpful more often than helpful
 * (helpful rate < RETIRE_HELPFUL_RATE). Retirement is the safeguard that
 * stops a bad/misleading lesson from permanently poisoning future runs:
 * retired lessons are excluded from retrieval until fresh evidence
 * re-validates them (storeLesson merge resets `retired`).
 */
export const RETIRE_MIN_USES = 3
export const RETIRE_HELPFUL_RATE = 0.35

/**
 * After a task completes, update usage stats for every lesson that was
 * retrieved into the planner. A lesson "helped" when the task using it scored
 * >= 0.75 (and was not a failure).
 */
export async function recordLessonUsage(lessonIds: string[], score: number, success: boolean): Promise<void> {
  if (lessonIds.length === 0) return
  const helpful = success && score >= 0.75
  await db.lesson.updateMany({
    where: { id: { in: lessonIds } },
    data: {
      useCount: { increment: 1 },
      ...(helpful
        ? { helpfulCount: { increment: 1 } }
        : { notHelpfulCount: { increment: 1 } }),
    },
  })
  // retirement check (poisoning safeguard)
  const used = await db.lesson.findMany({
    where: { id: { in: lessonIds } },
    select: { id: true, useCount: true, helpfulCount: true, notHelpfulCount: true, retired: true },
  })
  for (const l of used) {
    if (l.retired) continue
    if (l.useCount >= RETIRE_MIN_USES && l.helpfulCount / l.useCount < RETIRE_HELPFUL_RATE) {
      await db.lesson.update({
        where: { id: l.id },
        data: { retired: true },
      })
      logger.warn('memory:lesson-retired', {
        lessonId: l.id,
        useCount: l.useCount,
        helpfulCount: l.helpfulCount,
        notHelpfulCount: l.notHelpfulCount,
        note: 'lesson repeatedly unhelpful — excluded from future retrieval',
      })
    }
  }
}

/** Upsert strategy performance statistics after a task. */
export async function updateStrategyStats(
  name: string,
  category: string,
  description: string,
  score: number,
  success: boolean,
): Promise<void> {
  const cleanName = name.trim().slice(0, 60)
  if (!cleanName) return
  const existing = await db.strategy.findUnique({ where: { name: cleanName } })
  if (existing) {
    await db.strategy.update({
      where: { name: cleanName },
      data: {
        uses: { increment: 1 },
        successes: { increment: success ? 1 : 0 },
        totalScore: { increment: score },
        updatedAt: new Date(),
      },
    })
  } else {
    await db.strategy.create({
      data: {
        name: cleanName,
        description: description.slice(0, 500),
        category: category || 'general',
        uses: 1,
        successes: success ? 1 : 0,
        totalScore: score,
      },
    })
  }
}

/** List strategies for a category ranked by Laplace-smoothed success rate. */
export async function rankStrategies(category: string, limit = 3): Promise<StrategyStats[]> {
  const strategies = await db.strategy.findMany({
    where: { category: category || 'general' },
    orderBy: { uses: 'desc' },
    take: 50,
  })
  return strategies
    .map((s) => ({
      name: s.name,
      description: s.description,
      uses: s.uses,
      successes: s.successes,
      // Laplace smoothing: prior of 1 success / 2 trials keeps low-sample
      // strategies from dominating and vice versa
      successRate: (s.successes + 1) / (s.uses + 2),
      meanScore: s.uses > 0 ? s.totalScore / s.uses : 0,
    }))
    .sort((a, b) => b.successRate - a.successRate || b.uses - a.uses)
    .slice(0, limit)
}
