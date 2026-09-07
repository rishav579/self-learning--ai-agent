/**
 * Task understanding: turns raw task text into structured fields
 * (goal / category / keywords / risk / complexity) that drive retrieval keys.
 * Fails OPEN: if the LLM is unavailable we fall back to local heuristic
 * extraction rather than crashing the task.
 */
import { logger } from '@/lib/logger'
import type { LlmClient } from '@/lib/llm'
import { UnderstandingSchema } from './schemas'
import type { Understanding } from './types'
import { tokenize } from './memory/retrieval'

function heuristicUnderstanding(taskInput: string): Understanding {
  const tokens = tokenize(taskInput)
  const freq = new Map<string, number>()
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t)
  const lower = taskInput.toLowerCase()
  let category = 'general'
  if (/\b(calc|compute|multiply|add|sum|arithmetic|percent)\b/.test(lower)) category = 'arithmetic'
  else if (/\b(read|file|config|settings|directory|folder)\b/.test(lower)) category = 'file_reading'
  else if (/\b(code|script|javascript|execute|function|fibonacci|algorithm)\b/.test(lower)) category = 'code_execution'
  else if (/\b(search|web|latest|news|current|who is|when did)\b/.test(lower)) category = 'web_research'
  return {
    goal: taskInput.slice(0, 200),
    category,
    keywords,
    riskLevel: 'low',
    complexity: 3,
  }
}

export async function understandTask(taskId: string, taskInput: string, llm: LlmClient): Promise<Understanding> {
  try {
    const u = await llm.chatJson<Understanding>({
      label: 'understand',
      system:
        'You analyze tasks given to an AI agent and extract structured metadata. Be concise. Category must reflect the dominant skill needed. Keywords are lowercase single words that future similar tasks would share.',
      prompt: `Task text: ${taskInput}`,
      shapeHint: `{"goal": "one-sentence restatement", "category": "arithmetic|file_reading|code_execution|web_research|data_analysis|general", "keywords": ["3-10 lowercase words"], "riskLevel": "low|medium|high", "complexity": 1-5}`,
      schema: UnderstandingSchema,
      attempts: 2,
    })
    logger.info('understand:ok', { taskId, category: u.category, keywords: u.keywords.length })
    return u
  } catch (e) {
    logger.warn('understand:fallback', { taskId, error: (e as Error).message })
    return heuristicUnderstanding(taskInput)
  }
}
