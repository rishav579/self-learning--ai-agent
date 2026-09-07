import { createLlmClient } from '@/lib/llm'
const llm = createLlmClient()
try {
  const out = await llm.chatJson<{ pong: string }>({
    system: 'You echo JSON.',
    prompt: 'Reply with {"pong":"ok"}',
    shapeHint: '{"pong":"ok"}',
    schema: (await import('zod')).z.object({ pong: (await import('zod')).z.string() }),
    label: 'probe',
    attempts: 2,
    timeoutMs: 30_000,
  })
  console.log('LLM OK:', JSON.stringify(out))
} catch (e) {
  console.log('LLM THROTTLED/ERR:', (e as Error).message.slice(0, 120))
}
