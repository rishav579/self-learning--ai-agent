/**
 * Core domain types for the self-improving agent.
 * These mirror the zod schemas in schemas.ts and the Prisma schema.
 */

export type TaskStatus =
  | 'pending'
  | 'understanding'
  | 'retrieving'
  | 'planning'
  | 'executing'
  | 'evaluating'
  | 'reflecting'
  | 'storing'
  | 'completed'
  | 'failed'

/** Learning-loop modes (also used as benchmark variants A/B/C/D). */
export type AgentMode =
  | 'no_memory' // A: no retrieval, no storage, no reflection, no strategy
  | 'memory_only' // B: experience retrieval + storage
  | 'memory_reflection' // C: + lesson extraction & retrieval
  | 'full' // D: + strategy tracking & selection

/**
 * Statuses of a task that has STARTED but not reached a terminal state.
 * Single source of truth for the runner's restart recovery and the health
 * endpoint's active-task count.
 */
export const IN_FLIGHT_STATUSES: TaskStatus[] = [
  'understanding', 'retrieving', 'planning', 'executing', 'evaluating', 'reflecting', 'storing',
]

/** Every non-terminal status (pending + in-flight). */
export const ACTIVE_TASK_STATUSES: TaskStatus[] = ['pending', ...IN_FLIGHT_STATUSES]

export interface ModeCapabilities {
  retrieveExperiences: boolean
  retrieveLessons: boolean
  storeExperiences: boolean
  storeLessons: boolean
  updateStrategyStats: boolean
  selectStrategy: boolean
}

export function modeCapabilities(mode: AgentMode): ModeCapabilities {
  switch (mode) {
    case 'no_memory':
      return {
        retrieveExperiences: false,
        retrieveLessons: false,
        storeExperiences: false,
        storeLessons: false,
        updateStrategyStats: false,
        selectStrategy: false,
      }
    case 'memory_only':
      return {
        retrieveExperiences: true,
        retrieveLessons: false,
        storeExperiences: true,
        storeLessons: false,
        updateStrategyStats: false,
        selectStrategy: false,
      }
    case 'memory_reflection':
      return {
        retrieveExperiences: true,
        retrieveLessons: true,
        storeExperiences: true,
        storeLessons: true,
        updateStrategyStats: false,
        selectStrategy: false,
      }
    case 'full':
      return {
        retrieveExperiences: true,
        retrieveLessons: true,
        storeExperiences: true,
        storeLessons: true,
        updateStrategyStats: true,
        selectStrategy: true,
      }
  }
}

// ---------------- Objective checks (evaluator) ----------------

export type CheckType =
  | 'output_contains' // result text contains expected (case-insensitive)
  | 'numeric_match' // a number in the result equals expected (tolerance)
  | 'regex_match' // RegExp(expected) tests the result
  | 'js_expression' // sandboxed boolean JS expr with `result` bound
  | 'tool_succeeded' // named tool executed successfully at least once

export interface CheckSpec {
  name: string
  type: CheckType
  expected?: string
  weight?: number // default 1
  tolerance?: number // numeric_match only, default 0.0001
}

export interface CheckResult {
  name: string
  type: CheckType
  passed: boolean
  detail: string
  weight: number
}

export interface EvaluationResult {
  objective: boolean
  checks: CheckResult[]
  score: number // 0..1 weighted ratio
  success: boolean
  summary: string
}

// ---------------- Structured LLM outputs ----------------

export interface Understanding {
  goal: string
  category: string
  keywords: string[]
  riskLevel: 'low' | 'medium' | 'high'
  complexity: number // 1..5
}

export interface Plan {
  goal: string
  steps: string[]
  toolsRequired: string[]
  riskLevel: 'low' | 'medium' | 'high'
  successCriteria: string[]
}

export type ExecutorAction =
  | { action: 'tool'; thought: string; tool: string; args: Record<string, unknown> }
  | { action: 'final'; thought: string; answer: string }

export interface Reflection {
  whatWorked: string
  whatFailed: string
  rootCause: string
  doDifferently: string
  lesson: {
    content: string
    type: 'success' | 'failure'
    confidence: number
    strategyName: string | null
    keywords: string[]
  }
}

export interface SubjectiveEvaluation {
  score: number // 0..1
  success: boolean
  summary: string
  strengths: string
  weaknesses: string
}

// ---------------- Tools ----------------

export interface ToolResult {
  success: boolean
  output: string
  error?: string
  data?: unknown
}

export interface ToolSpec {
  name: string
  description: string
  argsShape: string // JSON-ish shape hint for the LLM
}

// ---------------- Retrieval ----------------

export interface RetrievedLesson {
  id: string
  content: string
  type: string
  confidence: number
  similarity: number
  /** usage evidence carried from retrieval time so prompts need no re-query */
  useCount: number
  helpfulCount: number
  notHelpfulCount: number
  source: 'lesson'
}

export interface RetrievedExperience {
  id: string
  summary: string
  success: boolean
  score: number
  strategyName: string | null
  similarity: number
  source: 'experience'
}

export interface RetrievedMemory {
  lessons: RetrievedLesson[]
  experiences: RetrievedExperience[]
  lessonIds: string[]
}

// ---------------- Strategy ----------------

export interface StrategyStats {
  name: string
  description: string
  uses: number
  successes: number
  successRate: number
  meanScore: number
}
