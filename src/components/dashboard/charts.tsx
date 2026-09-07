'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, Brain, TrendingUp, Trophy } from 'lucide-react'
import type { BenchmarkModeResult, BenchmarkRun, MetricsResponse, StrategyItem } from './types'

const EMERALD = '#059669'
const AMBER = '#d97706'
const ROSE = '#e11d48'
const SLATE = '#64748b'

export function StrategyPanel({ strategies }: { strategies: StrategyItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Trophy className="size-5 text-emerald-600" aria-hidden /> Strategy performance</CardTitle>
        <CardDescription>
          Strategies are ranked by Laplace-smoothed success rate per task category and reused on future tasks.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-96">
          {strategies.length === 0 && (
            <p className="py-6 text-center text-muted-foreground">
              No strategies tracked yet — they emerge as the agent completes tasks in &quot;full&quot; mode.
            </p>
          )}
          <div className="space-y-3">
            {strategies.map((s) => (
              <div key={s.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-semibold">{s.name}</span>
                  <Badge variant="outline" className="text-[10px]">{s.category}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                  <div>
                    <div className="flex justify-between"><span className="text-muted-foreground">uses</span><span className="font-mono">{s.uses}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">successes</span><span className="font-mono">{s.successes}</span></div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between">
                      <span className="text-muted-foreground">success rate</span>
                      <span className="font-mono">{(s.successRate * 100).toFixed(0)}%</span>
                    </div>
                    <Progress value={s.successRate * 100} aria-label={`Success rate ${s.name}`} />
                  </div>
                  <div>
                    <div className="flex justify-between"><span className="text-muted-foreground">mean score</span><span className="font-mono">{s.meanScore.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">updated</span><span className="text-muted-foreground">{new Date(s.updatedAt).toLocaleDateString()}</span></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

export function MetricsPanel({ metrics }: { metrics: MetricsResponse | null }) {
  const s = metrics?.summary
  const chartData =
    metrics?.sequence.map((t) => ({
      n: `#${t.index}`,
      score: t.score,
      success: t.success ? 1 : 0,
    })) ?? []
  const bucketSize = 5
  const buckets: { label: string; mean: number | null; n: number }[] = []
  const seqLen = metrics?.sequence?.length ?? 0
  for (let i = 0; i < seqLen; i += bucketSize) {
    const slice = metrics!.sequence.slice(i, i + bucketSize)
    const mean = slice.reduce((acc, t) => acc + t.score, 0) / slice.length
    buckets.push({ label: `tasks ${i + 1}-${i + slice.length}`, mean: Math.round(mean * 1000) / 1000, n: slice.length })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><TrendingUp className="size-5 text-emerald-600" aria-hidden /> Improvement over time</CardTitle>
          <CardDescription>
            Score trajectory of completed &quot;full&quot;-mode tasks. Learning shows up as later tasks scoring higher
            than earlier ones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {s == null ? (
            <p className="py-6 text-center text-muted-foreground">No metrics yet.</p>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Stat label="completed" value={String(s.completedTasks)} />
                <Stat label="mean score" value={s.meanScore != null ? s.meanScore.toFixed(2) : '—'} />
                <Stat label="success rate" value={s.successRate != null ? `${(s.successRate * 100).toFixed(0)}%` : '—'} />
                <Stat label="first half" value={s.firstHalfMean != null ? s.firstHalfMean.toFixed(2) : '—'} />
                <Stat
                  label="second half"
                  value={s.secondHalfMean != null ? s.secondHalfMean.toFixed(2) : '—'}
                  accent={s.improvement != null ? (s.improvement > 0 ? 'text-emerald-600' : s.improvement < 0 ? 'text-rose-600' : '') : ''}
                  delta={s.improvement != null ? `${s.improvement > 0 ? '+' : ''}${s.improvement.toFixed(2)}` : undefined}
                />
              </div>
              {chartData.length > 0 && (
                <div className="h-56" role="img" aria-label="Line chart of task scores over time">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="n" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                        formatter={(v: number | string, name: string) => [name === 'score' ? Number(v).toFixed(2) : v, name]}
                      />
                      <Line type="monotone" dataKey="score" stroke={EMERALD} strokeWidth={2} dot={{ r: 3 }} name="score" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {buckets.length >= 2 && (
                <div className="mt-4 h-40" role="img" aria-label="Bar chart of mean score per task bucket">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={buckets} margin={{ top: 8, right: 16, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                      <Bar dataKey="mean" name="mean score" radius={[4, 4, 0, 0]}>
                        {buckets.map((b, i) => (
                          <Cell key={i} fill={b.mean != null && b.mean >= 0.9 ? EMERALD : b.mean != null && b.mean >= 0.6 ? AMBER : ROSE} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {metrics && metrics.topLessons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Brain className="size-5 text-emerald-600" aria-hidden /> Most-applied lessons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {metrics.topLessons.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-3 rounded-md border p-2 text-sm">
                <span className="flex-1">{l.content}</span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  applied {l.useCount}x · helpful {l.helpfulCount}/{l.helpfulCount + l.notHelpfulCount}
                </Badge>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Memory holds {metrics.memorySize.experiences} experiences and {metrics.memorySize.strategies} strategies.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value, accent, delta }: { label: string; value: string; accent?: string; delta?: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${accent ?? ''}`}>{value}</div>
      {delta && <div className={`text-xs ${delta.startsWith('-') ? 'text-rose-600' : 'text-emerald-600'}`}>{delta} vs first half</div>}
    </div>
  )
}

const MODE_NAMES: Record<string, string> = {
  no_memory: 'A: no memory',
  memory_only: 'B: memory',
  memory_reflection: 'C: +reflection',
  full: 'D: +strategy',
}

export function BenchmarkPanel({
  run,
  onLaunch,
  busy,
}: {
  run: BenchmarkRun | null
  onLaunch: (taskSet: 'default' | 'quick') => void
  busy: boolean
}) {
  const modes = ['no_memory', 'memory_only', 'memory_reflection', 'full'] as const
  const results = run?.results
  const chartData =
    results
      ? modes
          .filter((m) => results[m])
          .map((m) => ({ mode: MODE_NAMES[m], meanScore: results[m].meanScore, successRate: Math.round(results[m].successRate * 100) }))
      : []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Activity className="size-5 text-emerald-600" aria-hidden /> Learning experiment (A/B/C/D)</CardTitle>
          <CardDescription>
            Runs a fixed task set with objective checks under four configurations:
            <span className="mx-1 font-medium">A no memory</span>·
            <span className="mx-1 font-medium">B memory</span>·
            <span className="mx-1 font-medium">C + reflection</span>·
            <span className="mx-1 font-medium">D + strategy</span>.
            Measures whether the learning loop actually improves performance. Results below are real measurements —
            reset memory first for a clean comparison.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onLaunch('quick')}
            disabled={busy || run?.status === 'running'}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
          >
            {busy || run?.status === 'running' ? 'Running… (several minutes)' : 'Run quick benchmark (4 tasks × 4 modes)'}
          </button>
          <button
            type="button"
            onClick={() => onLaunch('default')}
            disabled={busy || run?.status === 'running'}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run full benchmark (6 tasks × 4 modes)
          </button>
        </CardContent>
      </Card>

      {run && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                Latest run · {run.taskSet} set · {new Date(run.createdAt).toLocaleString()}
              </CardTitle>
              <Badge variant={run.status === 'completed' ? 'default' : run.status === 'failed' ? 'destructive' : 'secondary'}>
                {run.status}
              </Badge>
            </div>
            {run.error && <CardDescription className="text-rose-600">{run.error}</CardDescription>}
            {run.status === 'running' && (
              <CardDescription>Running modes in order A → D. Polling will update this page automatically…</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {chartData.length > 0 && (
              <div className="h-56" role="img" aria-label="Bar chart comparing benchmark modes">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="mode" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="meanScore" name="mean score" fill={EMERALD} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="successRate" name="success rate %" fill={SLATE} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {results && (
              <div className="grid gap-3 md:grid-cols-2">
                {modes
                  .filter((m) => results[m])
                  .map((m) => {
                    const r: BenchmarkModeResult = results[m]
                    return (
                      <div key={m} className="rounded-lg border p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-semibold">{MODE_NAMES[m]}</span>
                          <span className={`font-mono text-lg font-bold ${r.meanScore >= 0.9 ? 'text-emerald-600' : r.meanScore >= 0.6 ? 'text-amber-600' : 'text-rose-600'}`}>
                            {r.meanScore.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          success rate {(r.successRate * 100).toFixed(0)}% · {r.perTask.filter((t) => t.success).length}/{r.perTask.length} passed · {r.totalToolCalls} tool calls
                        </div>
                        <div className="mt-2 space-y-1">
                          {r.perTask.map((t) => (
                            <div key={t.taskId} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1 text-xs">
                              <span className="flex items-center gap-1.5 truncate">
                                <span className={t.success ? 'text-emerald-600' : 'text-rose-600'}>{t.success ? '●' : '○'}</span>
                                {t.title}
                              </span>
                              <span className="shrink-0 font-mono text-muted-foreground">
                                {t.score.toFixed(2)} · {t.iterations}it · {t.llmCalls}llm
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
