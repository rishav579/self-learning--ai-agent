'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toaster } from '@/components/ui/sonner'
import { BrainCircuit } from 'lucide-react'
import { SubmitForm } from '@/components/dashboard/submit-form'
import { TaskDetail } from '@/components/dashboard/task-detail'
import { MemoryPanel, TasksTable } from '@/components/dashboard/panels'
import { StrategyPanel, MetricsPanel, BenchmarkPanel } from '@/components/dashboard/charts'
import { ACTIVE_STATUSES } from '@/components/dashboard/types'
import type {
  BenchmarkRun,
  ExperienceItem,
  LessonItem,
  MetricsResponse,
  StrategyItem,
  TaskDetail as TaskDetailType,
  TaskListItem,
} from '@/components/dashboard/types'
import { toast } from 'sonner'

interface TasksResponse {
  tasks: TaskListItem[]
}

interface MemoryResponse {
  lessons: LessonItem[]
  experiences: ExperienceItem[]
}

interface StrategiesResponse {
  strategies: StrategyItem[]
}

const TASK_TERMINAL = (t: TaskDetailType) => !ACTIVE_STATUSES.includes(t.status)

export default function Home() {
  const [tab, setTab] = useState('dashboard')
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [task, setTask] = useState<TaskDetailType | null>(null)
  const [tasks, setTasks] = useState<TaskListItem[]>([])
  const [lessons, setLessons] = useState<LessonItem[]>([])
  const [experiences, setExperiences] = useState<ExperienceItem[]>([])
  const [strategies, setStrategies] = useState<StrategyItem[]>([])
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const [benchmark, setBenchmark] = useState<BenchmarkRun | null>(null)
  const [benchmarkBusy, setBenchmarkBusy] = useState(false)
  const taskRef = useRef<TaskDetailType | null>(null)

  useEffect(() => {
    taskRef.current = task
  }, [task])

  // ---------- data loading ----------
  const loadLists = useCallback(async () => {
    try {
      const [tasksRes, memoryRes, strategiesRes, metricsRes] = await Promise.all([
        fetch('/api/tasks?limit=100'),
        fetch('/api/memory?limit=100'),
        fetch('/api/strategies'),
        fetch('/api/metrics'),
      ])
      if (tasksRes.ok) setTasks(((await tasksRes.json()) as TasksResponse).tasks)
      if (memoryRes.ok) {
        const m = (await memoryRes.json()) as MemoryResponse
        setLessons(m.lessons)
        setExperiences(m.experiences)
      }
      if (strategiesRes.ok) setStrategies(((await strategiesRes.json()) as StrategiesResponse).strategies)
      if (metricsRes.ok) {
        const body = await metricsRes.json()
        setMetrics(body.error ? null : (body as MetricsResponse))
      }
    } catch {
      // transient network errors during polling are not fatal
    }
  }, [])

  const loadBenchmark = useCallback(async () => {
    try {
      const res = await fetch('/api/benchmark')
      if (res.ok) {
        const body = await res.json()
        const runs = (body.runs ?? []) as BenchmarkRun[]
        setBenchmark(runs[0] ?? null)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const loadTask = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/tasks/${id}`)
      if (res.ok) {
        const body = await res.json()
        setTask(body.task as TaskDetailType)
        return body.task as TaskDetailType
      }
    } catch {
      /* ignore */
    }
    return null
  }, [])

  // open latest task on first mount so the dashboard is never empty
  useEffect(() => {
    let isMounted = true
    const init = async () => {
      await loadLists()
      if (!isMounted) return
      await loadBenchmark()
      if (!isMounted) return
      try {
        const res = await fetch('/api/tasks?limit=1')
        if (res.ok) {
          const body = (await res.json()) as TasksResponse
          if (body.tasks.length > 0 && isMounted) {
            setActiveTaskId(body.tasks[0].id)
            await loadTask(body.tasks[0].id)
          }
        }
      } catch {
        /* ignore */
      }
    }
    void init()
    return () => {
      isMounted = false
    }
  }, [loadLists, loadBenchmark, loadTask])

  // ---------- live polling ----------
  useEffect(() => {
    const interval = setInterval(
      () => {
        const current = taskRef.current
        void loadLists()
        if (activeTaskId && current && !TASK_TERMINAL(current)) {
          void loadTask(activeTaskId)
        }
        if (benchmark?.status === 'running') {
          void loadBenchmark()
        }
      },
      2000,
    )
    return () => clearInterval(interval)
  }, [activeTaskId, benchmark?.status, loadTask, loadLists, loadBenchmark])

  // when the active task completes, refresh everything once more
  const lastCompletedRef = useRef<string | null>(null)
  useEffect(() => {
    if (task && TASK_TERMINAL(task) && task.id !== lastCompletedRef.current) {
      lastCompletedRef.current = task.id
      void loadLists()
      void loadBenchmark()
      if (task.status === 'completed') {
        toast.success('Task finished', {
          description: `score ${task.score?.toFixed(2) ?? '—'} — check the reflection tab content in the dashboard`,
        })
      }
    }
  }, [task, loadLists, loadBenchmark])

  const openTask = useCallback(
    async (id: string) => {
      setActiveTaskId(id)
      await loadTask(id)
      setTab('dashboard')
    },
    [loadTask],
  )

  const onSubmitted = useCallback(
    (id: string) => {
      setActiveTaskId(id)
      setTask(null)
      setTab('dashboard')
      void loadTask(id)
      void loadLists()
    },
    [loadTask, loadLists],
  )

  const resetMemory = useCallback(async () => {
    const res = await fetch('/api/memory', { method: 'DELETE' })
    if (res.ok) {
      const body = await res.json()
      toast.success('Memory reset', {
        description: `deleted ${body.deleted.lessons} lessons, ${body.deleted.experiences} experiences, ${body.deleted.strategies} strategies`,
      })
      void loadLists()
    } else {
      toast.error('Failed to reset memory')
    }
  }, [loadLists])

  const launchBenchmark = useCallback(
    async (taskSet: 'default' | 'quick' | 'hard') => {
      setBenchmarkBusy(true)
      try {
        const res = await fetch('/api/benchmark', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ taskSet }),
        })
        const body = await res.json()
        if (!res.ok) {
          toast.error(body.error ?? 'Failed to launch benchmark')
          return
        }
        toast.success('Benchmark started — it runs in the background and will take several minutes')
        void loadBenchmark()
      } finally {
        setBenchmarkBusy(false)
      }
    },
    [loadBenchmark],
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/60 via-background to-background dark:from-emerald-950/20">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-600 text-white" aria-hidden>
              <BrainCircuit className="size-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">Self-Improving Agent</h1>
              <p className="text-xs text-muted-foreground">
                task → retrieve → plan → tools → evaluate → reflect → learn → improve
              </p>
            </div>
          </div>
          <nav aria-label="System summary" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border px-2.5 py-1">{tasks.length} tasks</span>
            <span className="rounded-full border px-2.5 py-1">{lessons.length} lessons</span>
            <span className="rounded-full border px-2.5 py-1">{strategies.length} strategies</span>
            <a href="/api" target="_blank" rel="noreferrer" className="rounded-full border px-2.5 py-1 underline-offset-2 hover:underline">
              health API
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1" role="tablist" aria-label="Dashboard sections">
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-background data-[state=active]:text-emerald-700">Dashboard</TabsTrigger>
            <TabsTrigger value="tasks" className="data-[state=active]:bg-background data-[state=active]:text-emerald-700">Tasks</TabsTrigger>
            <TabsTrigger value="memory" className="data-[state=active]:bg-background data-[state=active]:text-emerald-700">Memory</TabsTrigger>
            <TabsTrigger value="strategies" className="data-[state=active]:bg-background data-[state=active]:text-emerald-700">Strategies</TabsTrigger>
            <TabsTrigger value="metrics" className="data-[state=active]:bg-background data-[state=active]:text-emerald-700">Improvement</TabsTrigger>
            <TabsTrigger value="benchmark" className="data-[state=active]:bg-background data-[state=active]:text-emerald-700">Experiment</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <SubmitForm onSubmitted={onSubmitted} />
              </div>
              <div className="lg:col-span-3">
                {task ? (
                  <TaskDetail task={task} compact />
                ) : activeTaskId ? (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed p-8 text-muted-foreground">
                    Loading task…
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <p className="font-medium text-foreground">No task selected</p>
                    <p className="text-sm">Submit a task or pick one from the Tasks tab to watch the full learning loop live.</p>
                  </div>
                )}
              </div>
            </div>
            {task && <TaskDetail task={task} />}
          </TabsContent>

          <TabsContent value="tasks">
            <TasksTable tasks={tasks} onOpen={openTask} />
          </TabsContent>

          <TabsContent value="memory">
            <MemoryPanel lessons={lessons} experiences={experiences} onReset={resetMemory} />
          </TabsContent>

          <TabsContent value="strategies">
            <StrategyPanel strategies={strategies} />
          </TabsContent>

          <TabsContent value="metrics">
            <MetricsPanel metrics={metrics} />
          </TabsContent>

          <TabsContent value="benchmark">
            <BenchmarkPanel run={benchmark} onLaunch={launchBenchmark} busy={benchmarkBusy} />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="mt-auto border-t bg-background/80 py-4 text-center text-xs text-muted-foreground">
        Memory-based behavioral adaptation — the LLM&apos;s weights are not retrained. Improvement comes from retrieved
        lessons, experiences, and strategy statistics.
      </footer>
      <Toaster richColors position="bottom-right" />
    </div>
  )
}
