/**
 * Scripted LLM mock for deterministic integration tests.
 * Responses are queued per label ('understand' | 'plan' | 'execute' | 'evaluate' | 'reflect').
 */
import type { ChatJsonOptions, ChatMsg, LlmClient } from '@/lib/llm'

export class ScriptedLlm implements LlmClient {
  private queue: Record<string, unknown[]> = {}
  public calls: { label: string; prompt: string }[] = []

  constructor(script: Record<string, unknown[]>) {
    this.queue = Object.fromEntries(Object.entries(script).map(([k, v]) => [k, [...v]]))
  }

  async chat(_messages: ChatMsg[]): Promise<string> {
    return 'mock'
  }

  async chatJson<T>(opts: ChatJsonOptions): Promise<T> {
    this.calls.push({ label: opts.label, prompt: opts.prompt })
    const q = this.queue[opts.label]
    if (!q || q.length === 0) {
      throw new Error(`ScriptedLlm: no scripted response for label "${opts.label}"`)
    }
    return q.shift() as T
  }

  /** true when every executor step was consumed */
  exhausted(label: string): boolean {
    const q = this.queue[label]
    return !q || q.length === 0
  }
}
