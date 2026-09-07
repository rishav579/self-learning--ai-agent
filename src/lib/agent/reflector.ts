/**
 * Reflection: converts a completed (or failed) run into structured memory —
 * what worked, what failed, why, what to do differently, and a reusable
 * lesson. zod-validated. Fails OPEN (returns null) so a reflection outage
 * never loses the task result itself.
 */
import { logger } from '@/lib/logger'
import type { LlmClient } from '@/lib/llm'
import { truncate } from '@/lib/llm'
import { ReflectionSchema } from './schemas'
import type { EvaluationResult, Reflection } from './types'

export async function reflectOnRun(
  taskId: string,
  taskInput: string,
  plan: { steps: string[] } | null,
  transcript: { thought: string; tool?: string; observation?: string; answer?: string }[],
  evaluation: EvaluationResult,
  llm: LlmClient,
): Promise<Reflection | null> {
  const transcriptText = transcript
    .map((t, i) => {
      const parts = [`[${i + 1}] ${t.thought}`]
      if (t.tool) parts.push(`    tool: ${t.tool} → ${truncate(t.observation ?? '', 400)}`)
      if (t.answer) parts.push(`    final answer: ${truncate(t.answer, 300)}`)
      return parts.join('\n')
    })
    .join('\n')
    .slice(0, 6000)

  try {
    const reflection = await llm.chatJson<Reflection>({
      label: 'reflect',
      system: `You are the reflection module of a self-improving AI agent. After each task you analyze the run honestly and extract ONE reusable lesson.
Rules for the lesson:
- It must be actionable and general enough to help FUTURE SIMILAR tasks, but specific enough to be useful.
- Good examples: "For multiplication tasks, always use the calculator tool — mental arithmetic produced wrong answers." / "Before reading a sandbox file, call list_files to discover exact paths."
- The lesson must be grounded in what ACTUALLY happened in this run (do not invent causes).
- type = "failure" if the task failed or scored poorly, "success" if the approach worked and should be repeated.
- confidence: how strongly this run's evidence supports the lesson (0..1).
- keywords: 3-8 lowercase single words that describe which future tasks this applies to.`,
      prompt: `TASK: ${truncate(taskInput, 800)}

PLAN: ${plan ? plan.steps.map((s, i) => `${i + 1}. ${s}`).join(' | ') : '(fallback plan)'}

EXECUTION TRANSCRIPT:
${transcriptText || '(no tool calls were made)'}

EVALUATION:
- score: ${evaluation.score.toFixed(2)}
- verdict: ${evaluation.success ? 'SUCCESS' : 'FAILURE'}
- checks: ${evaluation.checks.map((c) => `${c.name}=${c.passed ? 'pass' : 'FAIL'}`).join(', ')}
- summary: ${truncate(evaluation.summary, 500)}

Analyze this run and extract the lesson.`,
      shapeHint: `{"whatWorked": "...", "whatFailed": "...", "rootCause": "...", "doDifferently": "...", "lesson": {"content": "one reusable lesson sentence", "type": "success|failure", "confidence": 0.0-1.0, "strategyName": "short name of the strategy/procedure used, or null", "keywords": ["word1","word2"]}}`,
      schema: ReflectionSchema,
      // default attempts (4) with rate-limit backoff — lesson extraction is
      // the core of the learning loop and worth waiting for
    })
    logger.info('reflect:ok', {
      taskId,
      lessonType: reflection.lesson.type,
      confidence: reflection.lesson.confidence,
    })
    return reflection
  } catch (e) {
    logger.warn('reflect:failed', { taskId, error: (e as Error).message })
    return null
  }
}
