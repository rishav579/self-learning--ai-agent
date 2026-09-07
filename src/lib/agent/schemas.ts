/**
 * Zod schemas for every piece of model-generated data.
 * NOTHING the LLM produces enters the database without passing one of these.
 */
import { z } from 'zod'
import { truncate } from '@/lib/llm'

const cleanString = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'must not be empty')
    .transform((s) => truncate(s, max))

const keywordArray = z
  .array(z.string().trim().toLowerCase().min(2).max(40))
  .max(12)
  .catch([])

// ---------------- Task understanding ----------------

export const UnderstandingSchema = z.object({
  goal: cleanString(300),
  category: z
    .enum(['arithmetic', 'file_reading', 'code_execution', 'web_research', 'data_analysis', 'general'])
    .catch('general'),
  keywords: keywordArray,
  riskLevel: z.enum(['low', 'medium', 'high']).catch('low'),
  complexity: z.coerce.number().int().min(1).max(5).catch(3),
})

// ---------------- Plan ----------------

export const PlanSchema = z.object({
  goal: cleanString(300),
  steps: z.array(cleanString(300)).min(1).max(8),
  toolsRequired: z.array(z.string().trim().min(2).max(40)).max(6).catch([]),
  riskLevel: z.enum(['low', 'medium', 'high']).catch('low'),
  successCriteria: z.array(cleanString(200)).max(6).catch([]),
})

// ---------------- Executor action ----------------

export const ExecutorActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('tool'),
    thought: cleanString(600),
    tool: z.string().trim().min(2).max(40),
    args: z.record(z.string(), z.unknown()).catch({}),
  }),
  z.object({
    action: z.literal('final'),
    thought: cleanString(600),
    answer: cleanString(4000),
  }),
])

// ---------------- Reflection ----------------

export const ReflectionLessonSchema = z.object({
  content: cleanString(500),
  type: z.enum(['success', 'failure']).catch('success'),
  confidence: z.coerce.number().min(0).max(1).catch(0.5),
  strategyName: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((v) => (v && v.length > 1 ? v : null)),
  keywords: keywordArray,
})

export const ReflectionSchema = z.object({
  whatWorked: cleanString(800),
  whatFailed: cleanString(800),
  rootCause: cleanString(800),
  doDifferently: cleanString(800),
  lesson: ReflectionLessonSchema,
})

// ---------------- Subjective (fallback) evaluation ----------------

export const SubjectiveEvaluationSchema = z.object({
  score: z.coerce.number().min(0).max(1),
  success: z.coerce.boolean().catch(false),
  summary: cleanString(600),
  strengths: cleanString(400).catch(''),
  weaknesses: cleanString(400).catch(''),
})

// ---------------- API input validation ----------------

export const CheckSpecSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(['output_contains', 'numeric_match', 'regex_match', 'js_expression', 'tool_succeeded']),
  expected: z.string().max(500).optional(),
  weight: z.coerce.number().min(0).max(10).optional(),
  tolerance: z.coerce.number().min(0).max(1000).optional(),
})

export const CreateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  input: z.string().trim().min(4).max(2000),
  checks: z.array(CheckSpecSchema).max(5).optional(),
  mode: z.enum(['no_memory', 'memory_only', 'memory_reflection', 'full']).optional(),
})

export const RunBenchmarkSchema = z.object({
  taskSet: z.enum(['default', 'quick', 'hard']).optional(),
  modes: z
    .array(z.enum(['no_memory', 'memory_only', 'memory_reflection', 'full']))
    .min(1)
    .max(4)
    .optional(),
})
