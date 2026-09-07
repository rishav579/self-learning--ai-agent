/**
 * Memory retrieval — keyword/TF-IDF cosine similarity over lessons and
 * experiences, with a relevance threshold to avoid flooding the planner.
 *
 * Honest description: this is lexical similarity (bag-of-words + term
 * weighting), not neural embeddings. It is deterministic, fast, testable,
 * and sufficient to demonstrate experience-driven behavioral change.
 */
import { db } from '@/lib/db'
import type { RetrievedMemory } from '../types'

// ---------------------------------------------------------------------------
// Pure tokenization / similarity functions (exported for tests)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'by', 'for', 'with', 'about',
  'into', 'through', 'during', 'before', 'after', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off',
  'over', 'under', 'again', 'further', 'once', 'here', 'there', 'all', 'any', 'both', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'can', 'will', 'just', 'should', 'now', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'would', 'could', 'may',
  'might', 'must', 'shall', 'of', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
  'she', 'we', 'they', 'them', 'his', 'her', 'my', 'your', 'as', 'and', 'report', 'give', 'me', 'using',
  'use', 'result', 'results', 'task', 'value', 'find', 'what', 'which', 'who', 'how', 'many', 'much',
])

/** Tokenize text into lowercase terms (keeps numbers, drops stopwords). */
export function tokenize(text: string): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && t.length <= 30 && !STOPWORDS.has(t))
}

/** Term-frequency map. */
function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
  return tf
}

/**
 * Cosine similarity between two token-bags (TF vectors, 1+log weighting).
 * Pure function: 0..1.
 */
export function cosineSimilarity(aTokens: string[], bTokens: string[]): number {
  if (aTokens.length === 0 || bTokens.length === 0) return 0
  const a = termFreq(aTokens)
  const b = termFreq(bTokens)
  const tfValue = (m: Map<string, number>, t: string) => 1 + Math.log(m.get(t) ?? 0)
  let dot = 0
  let normA = 0
  let normB = 0
  for (const [t, _c] of a) {
    const v = tfValue(a, t)
    normA += v * v
    const bw = b.get(t)
    if (bw) dot += v * tfValue(b, t)
  }
  for (const [t, _c] of b) {
    const v = tfValue(b, t)
    normB += v * v
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** Jaccard similarity (used for lesson dedup — stricter overlap measure). */
export function jaccardSimilarity(aTokens: string[], bTokens: string[]): number {
  const A = new Set(aTokens)
  const B = new Set(bTokens)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

// ---------------------------------------------------------------------------
// Retrieval (DB-backed)
// ---------------------------------------------------------------------------

export const DEFAULT_SIMILARITY_THRESHOLD = 0.15
export const DEFAULT_TOP_K = 5

function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

export interface RetrieveOptions {
  category?: string
  threshold?: number
  topK?: number
  /** limit how many rows we scan (most recent first) */
  scanLimit?: number
}

/**
 * Retrieve relevant lessons + past experiences for a task description.
 * Combines: lexical similarity + exact category bonus + confidence weighting.
 */
export async function retrieveRelevantMemory(
  taskText: string,
  category: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedMemory> {
  const threshold = opts.threshold ?? DEFAULT_SIMILARITY_THRESHOLD
  const topK = opts.topK ?? DEFAULT_TOP_K
  const scanLimit = opts.scanLimit ?? 200
  const queryTokens = tokenize(taskText)
  if (queryTokens.length === 0) {
    return { lessons: [], experiences: [], lessonIds: [] }
  }

  const [lessons, experiences] = await Promise.all([
    // retired lessons (repeatedly unhelpful) are excluded from retrieval
    db.lesson.findMany({ where: { retired: false }, take: scanLimit, orderBy: { updatedAt: 'desc' } }),
    db.experience.findMany({ take: scanLimit, orderBy: { createdAt: 'desc' } }),
  ])

  const scoredLessons = lessons
    .map((l) => {
      const docTokens = [...tokenize(l.content), ...parseJsonArray(l.keywords)]
      let score = cosineSimilarity(queryTokens, docTokens)
      if (category && l.category === category && score > 0) score += 0.1
      // trust multiplier: confidence ±10%, plus a real penalty for lessons
      // that were applied before and did not help (usage evidence beats
      // self-reported confidence). Unproven lessons keep full weight.
      const uses = l.helpfulCount + l.notHelpfulCount
      const helpfulRate = uses > 0 ? l.helpfulCount / uses : null
      let trust = 0.9 + 0.1 * l.confidence
      if (helpfulRate !== null && uses >= 2) trust *= 0.55 + 0.45 * helpfulRate
      score = score * trust
      return {
        id: l.id,
        content: l.content,
        type: l.type,
        confidence: l.confidence,
        similarity: Math.round(Math.min(Math.max(score, 0), 1) * 1000) / 1000,
        // usage stats travel WITH the lesson so prompt rendering needs no
        // second DB query (they cannot change between retrieval and planning
        // within one task — usage is only recorded at task end)
        useCount: l.useCount,
        helpfulCount: l.helpfulCount,
        notHelpfulCount: l.notHelpfulCount,
        source: 'lesson' as const,
        _raw: l,
      }
    })
    .filter((l) => l.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)

  const scoredExperiences = experiences
    .map((e) => {
      const docTokens = [...tokenize(e.taskSummary), ...tokenize(e.outcome), ...parseJsonArray(e.keywords)]
      let score = cosineSimilarity(queryTokens, docTokens)
      if (category && e.category === category && score > 0) score += 0.1
      return {
        id: e.id,
        summary: e.taskSummary,
        success: e.success,
        score: e.score,
        strategyName: e.strategyName,
        similarity: Math.round(Math.min(score, 1) * 1000) / 1000,
        source: 'experience' as const,
      }
    })
    .filter((e) => e.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(2, topK - scoredLessons.length))

  return {
    lessons: scoredLessons.map(({ _raw, ...rest }) => rest),
    experiences: scoredExperiences,
    lessonIds: scoredLessons.map((l) => l.id),
  }
}

/**
 * Render retrieved memory as a compact prompt block for the planner/executor.
 * Includes usage statistics so the model knows how trustworthy a lesson is.
 */
export function renderMemoryForPrompt(memory: RetrievedMemory): string {
  if (memory.lessons.length === 0 && memory.experiences.length === 0) {
    return 'No relevant past experience found. You are solving this type of task for the first time.'
  }
  const lines: string[] = []
  if (memory.lessons.length > 0) {
    lines.push('RELEVANT LESSONS from past tasks (apply them unless clearly inapplicable):')
    for (const l of memory.lessons) {
      const uses = l.helpfulCount + l.notHelpfulCount
      const track = ` [applied ${l.useCount}x, helpful ${l.helpfulCount}/${uses}, confidence ${(l.confidence * 100).toFixed(0)}%]`
      lines.push(`- (${l.type}) ${l.content}${track}`)
    }
  }
  if (memory.experiences.length > 0) {
    lines.push('')
    lines.push('SIMILAR PAST EXPERIENCES:')
    for (const e of memory.experiences) {
      lines.push(`- "${e.summary}" → ${e.success ? 'SUCCESS' : 'FAILURE'} (score ${e.score.toFixed(2)})${e.strategyName ? ` using strategy "${e.strategyName}"` : ''}`)
    }
  }
  return lines.join('\n')
}
