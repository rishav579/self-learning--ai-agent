/**
 * Memory persistence:
 *  - storeExperience: one row per completed task
 *  - storeLesson: dedup-aware lesson upsert (near-duplicates are merged)
 *  - recordLessonUsage: tracks whether retrieved lessons actually helped
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

export async function storeExperience(input: StoreExperienceInput) {
  return db.experience.create({
    data: {
      taskId: input.taskId,
      taskSummary: input.taskSummary.slice(0, 500),
      category: input.category || 'general',
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

  let best: { id: string; sim: number } | null = null
  for (const c of candidates) {
    const sim = Math.max(cosineSimilarity(contentTokens, tokenize(c.content)), jaccardSimilarity(contentTokens, tokenize(c.content)))
    if (!best || sim > best.sim) best = { id: c.id, sim }
  }

  if (best && best.sim >= DEDUP_SIMILARITY) {
    // Merge: reinforce confidence, keep the more specific content, bump stats
    const existing = await db.lesson.findUnique({ where: { id: best.id } })
    if (existing) {
      const newConfidence = Math.min(1, Math.max(existing.confidence, reflection.lesson.confidence) + 0.05)
      const mergedKeywords = Array.from(
        new Set([...JSON.parse(existing.keywords || '[]') as string[], ...reflection.lesson.keywords]),
      ).slice(0, 12)
      await db.lesson.update({
        where: { id: existing.id },
        data: {
          confidence: newConfidence,
          refinements: { increment: 1 },
          keywords: JSON.stringify(mergedKeywords),
          strategyName: reflection.lesson.strategyName ?? existing.strategyName,
          updatedAt: new Date(),
        },
      })
      logger.info('memory:lesson-merged', { taskId: sourceTaskId, lessonId: existing.id, similarity: Math.round(best.sim * 100) / 100 })
      return { lessonId: existing.id, deduplicated: true, similarity: best.sim }
    }
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
  return { lessonId: lesson.id, deduplicated: false, similarity: best?.sim ?? 0 }
}

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
