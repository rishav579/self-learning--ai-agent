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

/**
 * HARD benchmark (v2) — designed so memory can actually matter.
 *
 * HONEST HISTORY: v1 used a bare-integer regex check ("^[0-9]+$") as the
 * hidden format requirement. Empirically the base LLM ALREADY answers
 * "Compute X." tasks with a bare number, so mode A passed everything —
 * a ceiling effect, same as the default set. v1 results are reported as-is.
 *
 * v2 uses an OUTPUT-CONVENTION trap instead: the checker requires the final
 * answer in the exact form "ANSWER: <integer>". Nothing in the task text
 * reveals this convention, and no natural LLM style produces it, so a
 * first-time agent objectively fails. The ONLY way to pass later tasks is
 * to have stored and retrieved the lesson ("the evaluator's convention is
 * the ANSWER: prefix"). This models real-world output contracts (API
 * schemas, report formats) and is information the agent genuinely cannot
 * know without experience. No lesson text is hard-coded into prompts.
 *
 * Sandbox-fact tasks remain solvable by all modes but reward memory with
 * fewer discovery iterations (measured via llmCalls / iterations).
 */
export const HARD_BENCHMARK: PresetTask[] = [
  {
    title: 'Convention trap #1 (multiplication)',
    input: 'Compute 4729 * 8371.',
    checks: [{ name: 'answer follows the evaluator convention', type: 'regex_match', expected: '^ANSWER: [0-9]+$' }],
  },
  {
    title: 'Convention trap #2 (multiplication)',
    input: 'Compute 6209 * 5177.',
    checks: [{ name: 'answer follows the evaluator convention', type: 'regex_match', expected: '^ANSWER: [0-9]+$' }],
  },
  {
    title: 'Sandbox fact #1 (discover + read notes)',
    input: 'What release channel is recorded in the sandbox notes file?',
    checks: [{ name: 'channel mentioned', type: 'output_contains', expected: 'beta' }],
  },
  {
    title: 'Sandbox fact #2 (nested config + combine values)',
    input: 'From the sandbox settings file, report timeout_seconds plus retries as a single integer.',
    checks: [
      { name: 'combined value', type: 'numeric_match', expected: '33' },
      { name: 'answer follows the evaluator convention', type: 'regex_match', expected: '^ANSWER: [0-9]+$', weight: 0.5 },
    ],
  },
  {
    title: 'Algorithm (exact fib(22))',
    input: 'Compute the 22nd Fibonacci number with F(1)=1 and F(2)=1.',
    checks: [
      { name: 'fib(22) value', type: 'numeric_match', expected: '17711' },
      { name: 'answer follows the evaluator convention', type: 'regex_match', expected: '^ANSWER: [0-9]+$', weight: 0.5 },
    ],
  },
  {
    title: 'Convention trap #3 (arithmetic)',
    input: 'Compute (9034 - 2861) * 17.',
    checks: [{ name: 'answer follows the evaluator convention', type: 'regex_match', expected: '^ANSWER: [0-9]+$' }],
  },
]

export function getBenchmarkSet(name: string): PresetTask[] {
  if (name === 'quick') return QUICK_BENCHMARK
  if (name === 'hard') return HARD_BENCHMARK
  return DEFAULT_BENCHMARK
}

export const BENCHMARK_MODE_ORDER: AgentMode[] = ['no_memory', 'memory_only', 'memory_reflection', 'full']
