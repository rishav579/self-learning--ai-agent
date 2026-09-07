'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileSearch,
  Gauge,
  Lightbulb,
  ListChecks,
  Loader2,
  Search,
  Wrench,
  XCircle,
} from 'lucide-react'
import { ACTIVE_STATUSES, STATUS_LABELS, MODE_LABELS } from './types'
import type { TaskDetail } from './types'

const STAGES = [
  { key: 'understanding', label: 'Understand', icon: Brain },
  { key: 'retrieving', label: 'Retrieve', icon: Search },
  { key: 'planning', label: 'Plan', icon: ListChecks },
  { key: 'executing', label: 'Execute', icon: Wrench },
  { key: 'evaluating', label: 'Evaluate', icon: ClipboardCheck },
  { key: 'reflecting', label: 'Reflect', icon: Lightbulb },
  { key: 'storing', label: 'Store', icon: BookOpen },
] as const

function stageIndex(status: string): number {
  if (status === 'completed') return STAGES.length
  if (status === 'failed') return STAGES.length
  const i = STAGES.findIndex((s) => s.key === status)
  return i === -1 ? 0 : i
}

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-muted-foreground'
  if (score >= 0.99) return 'text-emerald-600'
  if (score >= 0.6) return 'text-amber-600'
  return 'text-rose-600'
}

export function TaskDetail({ task, compact = false }: { task: TaskDetail; compact?: boolean }) {
  const active = ACTIVE_STATUSES.includes(task.status)
  const evaluation = task.evaluations[0]
  const reflectionEvent = task.events.find((e) => e.type === 'reflection')
  const reflection = (reflectionEvent?.payload ?? null) as Record<string, unknown> | null
  const lessonStoredEvent = task.events.find((e) => e.type === 'lesson_stored')
  const strategyEvent = task.events.find((e) => e.type === 'strategy_selected')
  const currentIndex = stageIndex(task.status)

  return (
    <div className="space-y-4">
      {/* ---------- Header + progress ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base leading-tight">{task.title}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={task.mode === 'full' ? 'default' : 'secondary'} className="whitespace-nowrap">
                {MODE_LABELS[task.mode] ?? task.mode}
              </Badge>
              {task.status === 'completed' && task.success && (
                <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                  <CheckCircle2 className="size-3" aria-hidden /> success
                </Badge>
              )}
              {task.status === 'completed' && !task.success && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="size-3" aria-hidden /> failed
                </Badge>
              )}
              {task.status === 'failed' && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="size-3" aria-hidden /> error
                </Badge>
              )}
              {active && (
                <Badge variant="secondary" className="gap-1">
                  <Loader2 className="size-3 animate-spin" aria-hidden /> {STATUS_LABELS[task.status] ?? task.status}
                </Badge>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{task.input}</p>
        </CardHeader>
        <CardContent>
          {/* Stepper */}
          <div role="progressbar" aria-label="Agent pipeline progress" aria-valuenow={currentIndex} aria-valuemin={0} aria-valuemax={STAGES.length} className="flex flex-wrap items-center gap-x-1 gap-y-2">
            {STAGES.map((stage, i) => {
              const done = currentIndex > i || task.status === 'completed'
              const isCurrent = task.status === stage.key
              const Icon = stage.icon
              return (
                <div key={stage.key} className="flex items-center gap-1">
                  <div
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      done
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                        : isCurrent
                          ? 'border-emerald-500 bg-emerald-600 text-white'
                          : 'border-border text-muted-foreground'
                    }`}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {done ? <CheckCircle2 className="size-3" aria-hidden /> : <Icon className={`size-3 ${isCurrent ? 'animate-pulse' : ''}`} aria-hidden />}
                    {stage.label}
                  </div>
                  {i < STAGES.length - 1 && <div className={`h-px w-3 ${done ? 'bg-emerald-300' : 'bg-border'}`} aria-hidden />}
                </div>
              )
            })}
            {task.status === 'completed' && (
              <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                <CheckCircle2 className="size-3" aria-hidden /> done
              </Badge>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="size-3" aria-hidden /> {new Date(task.createdAt).toLocaleTimeString()}</span>
            <span>LLM calls: {task.llmCalls}</span>
            <span>iterations: {task.iterations}/8</span>
            <span>tool calls: {task.toolExecutions.length}</span>
            {task.completedAt && (
              <span>
                duration: {fmtDuration(new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime())}
              </span>
            )}
            {task.score != null && (
              <span className={`font-semibold ${scoreColor(task.score)}`}>
                score {task.score.toFixed(2)}
              </span>
            )}
          </div>
          {task.error && (
            <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300" role="alert">
              {task.error}
            </div>
          )}
        </CardContent>
      </Card>

      {active && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          The agent is working — this view updates live…
          <Progress value={(currentIndex / STAGES.length) * 100} className="h-1.5 max-w-40" aria-hidden />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------- Understanding ---------- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold"><Brain className="size-4 text-emerald-600" aria-hidden /> Task understanding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {task.understanding ? (
              <>
                <p><span className="font-medium">Goal:</span> {task.understanding.goal}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">Category:</span>
                  <Badge variant="secondary">{task.understanding.category}</Badge>
                  <Badge variant="outline">risk: {task.understanding.riskLevel}</Badge>
                  <Badge variant="outline">complexity: {task.understanding.complexity}/5</Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(task.understanding.keywords ?? []).map((k) => (
                    <span key={k} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{k}</span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Waiting for the understanding stage…</p>
            )}
          </CardContent>
        </Card>

        {/* ---------- Retrieved memory ---------- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold"><FileSearch className="size-4 text-emerald-600" aria-hidden /> Retrieved memory</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {task.mode === 'no_memory' ? (
              <p className="text-muted-foreground">Memory disabled for mode A — solving from scratch.</p>
            ) : task.retrievedMemory && (task.retrievedMemory.lessons.length > 0 || task.retrievedMemory.experiences.length > 0) ? (
              <div className="space-y-2">
                {task.retrievedMemory.lessons.map((l) => (
                  <div key={l.id} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-900 dark:bg-amber-950">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-[10px]">{l.type} lesson</Badge>
                      <span className="text-muted-foreground">sim {l.similarity.toFixed(2)}</span>
                    </div>
                    <p className="mt-1 text-amber-900 dark:text-amber-200">{l.content}</p>
                  </div>
                ))}
                {task.retrievedMemory.experiences.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
                    <span className="truncate">{e.summary}</span>
                    <Badge variant={e.success ? 'secondary' : 'destructive'} className="shrink-0">
                      {e.success ? 'success' : 'failure'} · {e.score.toFixed(2)}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No relevant memories found — this is a first task of its kind.</p>
            )}
            {strategyEvent && (
              <Separator className="my-2" />
            )}
            {task.selectedStrategy && (
              <div className="mt-2 rounded-md border border-violet-200 bg-violet-50 p-2 text-xs dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200">
                <div className="font-semibold">Selected strategy: {task.selectedStrategy.name}</div>
                <div className="text-muted-foreground">
                  used {task.selectedStrategy.uses}x · success rate {(task.selectedStrategy.successRate * 100).toFixed(0)}% · mean score {task.selectedStrategy.meanScore.toFixed(2)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---------- Plan ---------- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="size-4 text-emerald-600" aria-hidden /> Plan</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {task.plan ? (
              <ol className="list-decimal space-y-1 pl-4">
                {task.plan.steps.map((s, i) => (
                  <li key={i} className={
                    task.toolExecutions.length >= i + 1 ? 'text-foreground' : 'text-muted-foreground'
                  }>{s}</li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground">Waiting for the planner…</p>
            )}
            {task.plan?.toolsRequired && task.plan.toolsRequired.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {task.plan.toolsRequired.map((t) => (
                  <Badge key={t} variant="outline" className="font-mono text-[10px]">{t}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---------- Tools + result ---------- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold"><Wrench className="size-4 text-emerald-600" aria-hidden /> Tool calls &amp; result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {task.toolExecutions.length === 0 && task.result == null && (
              <p className="text-muted-foreground">No tool calls yet…</p>
            )}
            <ScrollArea className="max-h-56 rounded-md border">
              <div className="p-2">
                {task.toolExecutions.map((t) => (
                  <details key={t.id} className="group rounded p-1.5 text-xs hover:bg-muted/50">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-mono">
                        {t.success ? (
                          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
                        ) : (
                          <XCircle className="size-3.5 shrink-0 text-rose-600" aria-hidden />
                        )}
                        {t.tool}
                      </span>
                      <span className="text-muted-foreground">{fmtDuration(t.durationMs)}</span>
                    </summary>
                    <div className="mt-1 space-y-1 border-l-2 pl-2 text-muted-foreground">
                      <div><span className="font-medium">args:</span> <code className="text-[10px]">{JSON.stringify(t.args)}</code></div>
                      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px]">
                        {t.result?.output ?? t.result?.error ?? t.error ?? ''}
                      </pre>
                    </div>
                  </details>
                ))}
              </div>
            </ScrollArea>
            {task.result != null && (
              <div className="rounded-md border bg-muted/40 p-2">
                <div className="mb-1 text-xs font-semibold">Final answer</div>
                <p className="whitespace-pre-wrap text-sm">{task.result}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---------- Evaluation ---------- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Gauge className="size-4 text-emerald-600" aria-hidden /> Evaluation
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {evaluation ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${scoreColor(evaluation.score)}`}>{evaluation.score.toFixed(2)}</span>
                  <Badge variant={evaluation.objective ? 'default' : 'secondary'}>
                    {evaluation.objective ? 'objective checks' : 'internal + LLM rubric'}
                  </Badge>
                  {evaluation.success ? (
                    <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="size-3" aria-hidden /> passed</Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1"><XCircle className="size-3" aria-hidden /> not passed</Badge>
                  )}
                </div>
                {evaluation.checks?.map((c: { name: string; passed: boolean; detail: string; weight: number }, i: number) => (
                  <div key={i} className="flex items-start gap-2 rounded-md border p-1.5 text-xs">
                    {c.passed ? (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
                    ) : (
                      <XCircle className="mt-0.5 size-3.5 shrink-0 text-rose-600" aria-hidden />
                    )}
                    <div>
                      <span className="font-medium">{c.name}</span> <span className="text-muted-foreground">(w={c.weight})</span>
                      <div className="text-muted-foreground">{c.detail}</div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">{evaluation.summary}</p>
              </div>
            ) : (
              <p className="text-muted-foreground">Waiting for evaluation…</p>
            )}
          </CardContent>
        </Card>

        {/* ---------- Reflection + lesson ---------- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold"><Lightbulb className="size-4 text-emerald-600" aria-hidden /> Reflection &amp; learned lesson</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {reflection && !('failed' in (reflection ?? {})) ? (
              <div className="space-y-2 text-xs">
                <p><span className="font-semibold text-emerald-700 dark:text-emerald-400">What worked:</span> {String(reflection.whatWorked)}</p>
                <p><span className="font-semibold text-rose-700 dark:text-rose-400">What failed:</span> {String(reflection.whatFailed)}</p>
                <p><span className="font-medium">Root cause:</span> {String(reflection.rootCause)}</p>
                <p><span className="font-medium">Next time:</span> {String(reflection.doDifferently)}</p>
                <Separator />
                {lessonStoredEvent ? (
                  <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2 dark:border-emerald-800 dark:bg-emerald-950">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                      <BookOpen className="size-3" aria-hidden /> lesson stored in long-term memory
                      {lessonStoredEvent.payload && 'deduplicated' in (lessonStoredEvent.payload as Record<string, unknown>) && (lessonStoredEvent.payload as { deduplicated?: boolean }).deduplicated && (
                        <Badge variant="outline" className="text-[9px]">merged with existing</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-200">
                      {String((reflection.lesson as { content: string })?.content ?? '')}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px]">{String((reflection.lesson as { type: string })?.type)}</Badge>
                      <Badge variant="outline" className="text-[10px]">confidence {Number((reflection.lesson as { confidence: number })?.confidence ?? 0).toFixed(2)}</Badge>
                      {(reflection.lesson as { strategyName?: string | null })?.strategyName && (
                        <Badge variant="outline" className="text-[10px]">strategy: {String((reflection.lesson as { strategyName: string }).strategyName)}</Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-2 text-muted-foreground">
                    Lesson not stored (mode {MODE_LABELS[task.mode] ?? task.mode} skips lesson storage)
                  </div>
                )}
              </div>
            ) : reflection && 'failed' in reflection ? (
              <p className="text-muted-foreground">Reflection unavailable for this run — the result was still stored.</p>
            ) : (
              <p className="text-muted-foreground">Waiting for reflection…</p>
            )}
          </CardContent>
        </Card>
      </div>

      {!compact && task.events.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Full event timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-64">
              <ol className="space-y-1 text-xs">
                {task.events.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-2">
                    <span className="w-16 shrink-0 font-mono text-[10px] text-muted-foreground">
                      {new Date(e.createdAt).toLocaleTimeString()}
                    </span>
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px]">{e.type}</Badge>
                    <span className="truncate text-muted-foreground">
                      {summarizeEvent(e)}
                    </span>
                    {e.durationMs != null && <span className="shrink-0 text-muted-foreground">{fmtDuration(e.durationMs)}</span>}
                  </li>
                ))}
              </ol>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function summarizeEvent(e: { type: string; payload: Record<string, unknown> }): string {
  const p = e.payload ?? {}
  try {
    switch (e.type) {
      case 'task_started':
        return `mode=${String(p.mode ?? '')}`
      case 'understanding':
        return `category=${String(p.category ?? '')}`
      case 'memory_retrieved':
        return p.skipped
          ? `skipped (${String(p.reason ?? '')})`
          : `lessons=${String(p.lessons ?? 0)}, experiences=${String(p.experiences ?? 0)}`
      case 'strategy_selected':
        return `strategy=${String((p.strategy as string) ?? 'none')}`
      case 'plan_created':
        return `${String((p.steps as string[] | undefined)?.length ?? 0)} steps`
      case 'iteration':
        return `#${String(p.iteration ?? '')} ${String(p.kind ?? '')}${p.tool ? ` → ${String(p.tool)}` : ''} · ${truncateText(String(p.thought ?? ''), 90)}`
      case 'tool_result':
        return p.final ? `final: ${truncateText(String(p.final), 100)}` : ''
      case 'evaluation':
        return `score=${String(p.score ?? '')} success=${String(p.success ?? '')}`
      case 'reflection':
        return 'failed' in p ? 'reflection unavailable' : truncateText(String((p.lesson as { content?: string })?.content ?? ''), 110)
      case 'lesson_stored':
        return `${p.deduplicated ? 'merged into' : 'created'} lesson: ${truncateText(String(p.content ?? ''), 90)}`
      case 'experience_stored':
        return `experience ${String(p.experienceId ?? '')}`
      case 'strategy_updated':
        return `${String(p.strategy ?? '')} score=${String(p.score ?? '')}`
      case 'task_completed':
        return `score=${String(p.score ?? '')} duration=${fmtDuration(p.durationMs as number | null)}`
      case 'task_failed':
        return truncateText(String(p.error ?? ''), 140)
      default:
        return truncateText(JSON.stringify(p), 100)
    }
  } catch {
    return ''
  }
}

function truncateText(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '…'
}
