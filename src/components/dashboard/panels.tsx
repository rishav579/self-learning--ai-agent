'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BookOpen, History, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { MODE_LABELS, STATUS_LABELS } from './types'
import type { ExperienceItem, LessonItem, TaskListItem } from './types'

export function TasksTable({ tasks, onOpen }: { tasks: TaskListItem[]; onOpen: (id: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><History className="size-5 text-emerald-600" aria-hidden /> Task history</CardTitle>
        <CardDescription>All runs, newest first. Click a task to reopen its full learning trace.</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background/95 text-left text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
              <tr>
                <th className="p-2">Task</th>
                <th className="p-2">Mode</th>
                <th className="p-2">Status</th>
                <th className="p-2 text-right">Score</th>
                <th className="p-2 text-right">Iter / LLM</th>
                <th className="p-2">Strategy</th>
                <th className="p-2 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">No tasks yet — submit one!</td>
                </tr>
              )}
              {tasks.map((t) => (
                <tr
                  key={t.id}
                  className="cursor-pointer border-t hover:bg-muted/50"
                  onClick={() => onOpen(t.id)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onOpen(t.id)}
                  aria-label={`Open task ${t.title}`}
                >
                  <td className="max-w-56 truncate p-2 font-medium">{t.title}</td>
                  <td className="p-2"><Badge variant="outline" className="text-[10px]">{MODE_LABELS[t.mode]?.slice(0, 1) ?? t.mode}</Badge></td>
                  <td className="p-2">
                    <span
                      className={
                        t.status === 'completed'
                          ? t.success
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                          : t.status === 'failed'
                            ? 'text-rose-600'
                            : 'text-amber-600'
                      }
                    >
                      {STATUS_LABELS[t.status] ?? t.status}
                    </span>
                  </td>
                  <td className="p-2 text-right font-mono">{t.score != null ? t.score.toFixed(2) : '—'}</td>
                  <td className="p-2 text-right font-mono text-xs text-muted-foreground">{t.iterations}/{t.llmCalls}</td>
                  <td className="max-w-40 truncate p-2 text-xs text-muted-foreground">{t.strategyName ?? '—'}</td>
                  <td className="p-2 text-right text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

export function MemoryPanel({
  lessons,
  experiences,
  onReset,
}: {
  lessons: LessonItem[]
  experiences: ExperienceItem[]
  onReset: () => void
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="size-5 text-emerald-600" aria-hidden /> Lessons (long-term memory)
          </CardTitle>
          <CardDescription>
            Reusable knowledge extracted from reflections. &quot;Applied / helpful&quot; tracks whether lessons actually
            improved later tasks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-rose-600 hover:text-rose-700"
              onClick={onReset}
              aria-label="Reset long-term memory"
            >
              <Trash2 className="size-3.5" aria-hidden /> Reset memory (lessons, experiences, strategies)
            </Button>
          </div>
          {lessons.length === 0 && <p className="py-4 text-center text-muted-foreground">No lessons learned yet.</p>}
          <ScrollArea className="max-h-96">
            <div className="space-y-2">
              {lessons.map((l) => (
                <div key={l.id} className="rounded-lg border p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant={l.type === 'failure' ? 'destructive' : 'secondary'} className="text-[10px] uppercase">{l.type}</Badge>
                    <Badge variant="outline" className="text-[10px]">{l.category}</Badge>
                    <Badge variant="outline" className="text-[10px]">confidence {(l.confidence * 100).toFixed(0)}%</Badge>
                    {l.useCount > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        applied {l.useCount}x · helpful {l.helpfulCount}/{l.helpfulCount + l.notHelpfulCount}
                      </Badge>
                    )}
                    {l.refinements > 0 && <Badge variant="outline" className="text-[10px]">refined {l.refinements}x</Badge>}
                    <span className="ml-auto text-[10px] text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm">{l.content}</p>
                  {l.strategyName && (
                    <p className="mt-1 text-xs text-muted-foreground">strategy: <span className="font-mono">{l.strategyName}</span></p>
                  )}
                  {l.keywords && l.keywords.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {l.keywords.map((k) => (
                        <span key={k} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{k}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Experiences</CardTitle>
          <CardDescription>Raw what-happened records, one per completed task.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-72">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-2">Summary</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Outcome</th>
                  <th className="p-2 text-right">Score</th>
                  <th className="p-2">Strategy</th>
                </tr>
              </thead>
              <tbody>
                {experiences.length === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No experiences stored yet.</td></tr>
                )}
                {experiences.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="max-w-72 truncate p-2">{e.taskSummary}</td>
                    <td className="p-2"><Badge variant="outline" className="text-[10px]">{e.category}</Badge></td>
                    <td className="p-2">
                      <span className={e.success ? 'text-emerald-600' : 'text-rose-600'}>{e.success ? 'success' : 'failure'}</span>
                    </td>
                    <td className="p-2 text-right font-mono">{e.score.toFixed(2)}</td>
                    <td className="max-w-40 truncate p-2 text-xs text-muted-foreground">{e.strategyName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
