/**
 * Fixed, reproducible task sets for the learning experiment.
 * Every benchmark task carries OBJECTIVE checks so results cannot be
 * self-graded. Task families are ordered so later tasks can benefit from
 * lessons learned on earlier ones (arithmetic → calculator lesson;
 * file discovery → list_files lesson; code → code_executor lesson).
 */
import type { AgentMode, CheckSpec } from './types'

export interface PresetTask {
  title: string
  input: string
  checks: CheckSpec[]
}

export const DEFAULT_BENCHMARK: PresetTask[] = [
  {
    title: 'Arithmetic #1 (hard multiplication)',
    input: 'Compute 8347 * 2953 and report the exact integer result.',
    checks: [
      { name: 'exact product', type: 'numeric_match', expected: '24648691' },
      { name: 'used calculator or code tool', type: 'tool_succeeded', expected: 'calculator', weight: 0.2 },
    ],
  },
  {
    title: 'Arithmetic #2 (hard multiplication)',
    input: 'Compute 7261 * 4018 and report the exact integer result.',
    checks: [
      { name: 'exact product', type: 'numeric_match', expected: '29174698' },
      { name: 'used calculator or code tool', type: 'tool_succeeded', expected: 'calculator', weight: 0.2 },
    ],
  },
  {
    title: 'File reading #1 (discover + read)',
    input: 'Find and read the deployment notes file in the agent sandbox, then report the deployment environment name and the region.',
    checks: [
      { name: 'environment mentioned', type: 'output_contains', expected: 'staging' },
      { name: 'region mentioned', type: 'output_contains', expected: 'us-east-1' },
    ],
  },
  {
    title: 'File reading #2 (nested config)',
    input: 'Read the YAML settings file inside the sandbox config folder and report the API timeout in seconds and the number of retries.',
    checks: [
      { name: 'timeout value', type: 'numeric_match', expected: '30' },
      { name: 'retries value', type: 'numeric_match', expected: '3' },
    ],
  },
  {
    title: 'Arithmetic #3 (mixed operations)',
    input: 'Compute (1793 + 847) * 61 and report the exact integer result.',
    checks: [
      { name: 'exact result', type: 'numeric_match', expected: '161040' },
      { name: 'used calculator or code tool', type: 'tool_succeeded', expected: 'calculator', weight: 0.2 },
    ],
  },
  {
    title: 'Code execution #1 (algorithm)',
    input: 'Execute JavaScript code that computes the 15th Fibonacci number (F(1)=1, F(2)=1) and report the value.',
    checks: [
      { name: 'fib(15) value', type: 'numeric_match', expected: '610' },
      { name: 'used the code executor', type: 'tool_succeeded', expected: 'code_executor', weight: 0.2 },
    ],
  },
]

export const QUICK_BENCHMARK: PresetTask[] = [
  DEFAULT_BENCHMARK[0],
  DEFAULT_BENCHMARK[1],
  DEFAULT_BENCHMARK[2],
  DEFAULT_BENCHMARK[3],
]

export interface PresetDemoTask {
  title: string
  input: string
  checks: CheckSpec[]
}

/** One-click demo tasks shown as chips in the UI. */
export const DEMO_PRESETS: PresetDemoTask[] = [
  {
    title: 'Hard multiplication (learn to use calculator)',
    input: 'Compute 4659 * 8831 and report the exact integer result.',
    checks: [{ name: 'exact product', type: 'numeric_match', expected: '41143629' }],
  },
  {
    title: 'Read sandbox file',
    input: 'Read the notes file in the agent sandbox and report the deployment environment.',
    checks: [{ name: 'environment', type: 'output_contains', expected: 'staging' }],
  },
  {
    title: 'Compute Fibonacci',
    input: 'Execute JavaScript code that computes the 20th Fibonacci number (F(1)=1, F(2)=1) and report the value.',
    checks: [{ name: 'fib(20)', type: 'numeric_match', expected: '6765' }],
  },
  {
    title: 'Open-ended task (subjective evaluation)',
    input: 'Search the web for who won the most recent FIFA World Cup and write a two-sentence summary with the final score.',
    checks: [],
  },
]

export function getBenchmarkSet(name: string): PresetTask[] {
  if (name === 'quick') return QUICK_BENCHMARK
  return DEFAULT_BENCHMARK
}

export const BENCHMARK_MODE_ORDER: AgentMode[] = ['no_memory', 'memory_only', 'memory_reflection', 'full']
