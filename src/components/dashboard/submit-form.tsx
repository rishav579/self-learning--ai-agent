'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Play, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { DemoPreset } from './types'

const DEMO_PRESETS: DemoPreset[] = [
  {
    title: 'Hard multiplication',
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
    title: 'Web research (subjective)',
    input: 'Search the web for who won the most recent FIFA World Cup and write a two-sentence summary including the final score.',
    checks: [],
  },
]

export function SubmitForm({ onSubmitted }: { onSubmitted: (taskId: string) => void }) {
  const [input, setInput] = useState('')
  const [expected, setExpected] = useState('')
  const [mode, setMode] = useState('full')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (input.trim().length < 4) {
      toast.error('Task description too short')
      return
    }
    setBusy(true)
    try {
      const checks =
        expected.trim().length > 0
          ? [{ name: 'expected output contains', type: 'output_contains', expected: expected.trim() }]
          : undefined
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: input.trim(), checks, mode }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to submit task')
        return
      }
      toast.success('Task queued — the agent is starting now')
      onSubmitted(data.id)
      setInput('')
      setExpected('')
    } catch (e) {
      toast.error(`Submission failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="size-5 text-emerald-600" aria-hidden />
          Give the agent a task
        </CardTitle>
        <CardDescription>
          The agent plans, uses tools, checks its work objectively, reflects, and stores a reusable lesson. Provide an
          &quot;expected output&quot; to make the evaluation fully objective.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="task-input">Task</Label>
          <Textarea
            id="task-input"
            placeholder="e.g. Compute 4659 * 8831 and report the exact integer result."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            maxLength={2000}
            aria-describedby="task-input-hint"
          />
          <p id="task-input-hint" className="text-xs text-muted-foreground">
            {input.length}/2000 characters
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="expected">Expected output contains (optional)</Label>
            <Input
              id="expected"
              placeholder="e.g. 41143629 — turns evaluation objective"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              maxLength={500}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mode">Learning mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger id="mode" aria-label="Learning mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">D · Memory + Reflection + Strategy</SelectItem>
                <SelectItem value="memory_reflection">C · Memory + Reflection</SelectItem>
                <SelectItem value="memory_only">B · Memory only</SelectItem>
                <SelectItem value="no_memory">A · No memory</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {DEMO_PRESETS.map((p) => (
            <button
              key={p.title}
              type="button"
              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
              onClick={() => {
                setInput(p.input)
                setExpected(p.checks[0]?.expected ?? '')
              }}
            >
              {p.title}
            </button>
          ))}
        </div>
        <Button onClick={submit} disabled={busy} className="w-full bg-emerald-600 hover:bg-emerald-700" aria-label="Submit task to the agent">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
          {busy ? 'Submitting…' : 'Run the agent'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Tools available: <Badge variant="outline" className="mx-0.5 font-mono text-[10px]">calculator</Badge>
          <Badge variant="outline" className="mx-0.5 font-mono text-[10px]">code_executor</Badge>
          <Badge variant="outline" className="mx-0.5 font-mono text-[10px]">file_inspector</Badge>
          <Badge variant="outline" className="mx-0.5 font-mono text-[10px]">list_files</Badge>
          <Badge variant="outline" className="mx-0.5 font-mono text-[10px]">web_search</Badge>
          <Badge variant="outline" className="mx-0.5 font-mono text-[10px]">http_get</Badge>
        </p>
      </CardContent>
    </Card>
  )
}
