/** Shared client-side types mirroring the API responses. */

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

export const ACTIVE_STATUSES: TaskStatus[] = [
  'pending',
  'understanding',
  'retrieving',
  'planning',
  'executing',
  'evaluating',
  'reflecting',
  'storing',
]

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Queued',
  understanding: 'Understanding',
  retrieving: 'Retrieving memory',
  planning: 'Planning',
  executing: 'Executing',
  evaluating: 'Evaluating',
  reflecting: 'Reflecting',
  storing: 'Storing memory',
  completed: 'Completed',
  failed: 'Failed',
}

export const MODE_LABELS: Record<string, string> = {
  no_memory: 'A · No memory',
  memory_only: 'B · Memory',
  memory_reflection: 'C · Memory + Reflection',
  full: 'D · Memory + Reflection + Strategy',
}

export interface Understanding {
  goal: string
  category: string
  keywords: string[]
  riskLevel: string
  complexity: number
}

export interface Plan {
  goal: string
  steps: string[]
  toolsRequired: string[]
  riskLevel: string
  successCriteria: string[]
}

export interface RetrievedMemory {
  lessons: { id: string; content: string; type: string; confidence: number; similarity: number }[]
  experiences: { id: string; summary: string; success: boolean; score: number; strategyName: string | null; similarity: number }[]
}

export interface CheckResult {
  name: string
  type: string
  passed: boolean
  detail: string
  weight: number
}

export interface Reflection {
  whatWorked: string
  whatFailed: string
  rootCause: string
  doDifferently: string
  lesson: {
    content: string
    type: string
    confidence: number
    strategyName: string | null
    keywords: string[]
  }
}

export interface AgentEvent {
  id: string
  taskId: string | null
  type: string
  payload: Record<string, unknown>
  durationMs: number | null
  createdAt: string
}

export interface ToolExecution {
  id: string
  tool: string
  args: Record<string, unknown>
  result: { success: boolean; output: string; error?: string } | null
  success: boolean
  durationMs: number
  error: string | null
  createdAt: string
}

export interface TaskDetail {
  id: string
  title: string
  input: string
  mode: string
  status: TaskStatus
  error: string | null
  understanding: Understanding | null
  retrievedMemory: RetrievedMemory | null
  selectedStrategy: { name: string; description: string; uses: number; successRate: number; meanScore: number } | null
  strategyName: string | null
  plan: Plan | null
  checks: { name: string; type: string; expected?: string; weight?: number }[] | null
  result: string | null
  score: number | null
  success: boolean | null
  iterations: number
  llmCalls: number
  createdAt: string
  completedAt: string | null
  events: AgentEvent[]
  toolExecutions: ToolExecution[]
  evaluations: { objective: boolean; checks: CheckResult[]; score: number; success: boolean; summary: string }[]
  experiences: { id: string; taskSummary: string; outcome: string; score: number; success: boolean }[]
  lessonsCreated: { id: string; content: string; type: string; confidence: number }[]
}

export interface TaskListItem {
  id: string
  title: string
  input: string
  mode: string
  status: TaskStatus
  score: number | null
  success: boolean | null
  iterations: number
  llmCalls: number
  strategyName: string | null
  createdAt: string
  completedAt: string | null
  error: string | null
}

export interface LessonItem {
  id: string
  content: string
  type: string
  confidence: number
  strategyName: string | null
  category: string
  keywords: string[] | null
  useCount: number
  helpfulCount: number
  notHelpfulCount: number
  refinements: number
  createdAt: string
}

export interface ExperienceItem {
  id: string
  taskSummary: string
  category: string
  outcome: string
  score: number
  success: boolean
  strategyName: string | null
  createdAt: string
}

export interface StrategyItem {
  id: string
  name: string
  description: string
  category: string
  uses: number
  successes: number
  successRate: number
  meanScore: number
  updatedAt: string
}

export interface MetricsResponse {
  mode: string
  sequence: { index: number; id: string; title: string; score: number; success: boolean; strategy: string | null }[]
  summary: {
    completedTasks: number
    meanScore: number | null
    successRate: number | null
    firstHalfMean: number | null
    secondHalfMean: number | null
    improvement: number | null
  }
  topLessons: { id: string; content: string; type: string; confidence: number; useCount: number; helpfulCount: number; notHelpfulCount: number }[]
  memorySize: { experiences: number; strategies: number }
  statusBreakdown: { status: string; count: number }[]
}

export interface BenchmarkModeResult {
  mode: string
  perTask: { taskId: string; title: string; score: number; success: boolean; iterations: number; llmCalls: number; toolCalls: number; durationMs: number }[]
  meanScore: number
  successRate: number
  totalToolCalls: number
  totalLlmCalls: number
  meanIterations: number
  meanDurationMs: number
  totalDurationMs: number
}

export interface BenchmarkRun {
  id: string
  taskSet: string
  modes: string[] | null
  results: Record<string, BenchmarkModeResult> | null
  status: string
  error: string | null
  createdAt: string
}

export interface DemoPreset {
  title: string
  input: string
  checks: { name: string; type: string; expected?: string }[]
}
