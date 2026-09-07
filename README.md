# Self-Improving AI Agent

A real, demonstrable **experience-driven self-improving agent**: it solves tasks with tools, evaluates itself
against **objective checks**, reflects on what happened, stores structured lessons in persistent memory, and
reuses those lessons and strategy statistics on future tasks — with a measurable A/B/C/D experiment to prove
whether the loop actually helps.

> **What this is NOT:** the base LLM's weights are **not** retrained. There is no fine-tuning, RL, or gradient
> update. Improvement is **memory-based behavioral adaptation**: retrieved lessons, experiences, and strategy
> statistics change what the planner and executor see, which changes behavior. The UI and this README state
> this plainly.

---

## The learning loop

```
Task ──► Understand (goal, category, keywords)
      ──► Retrieve memory (TF-IDF similar lessons + experiences, thresholded)
      ──► Select strategy (Laplace-ranked by past success rate)
      ──► Plan (zod-validated structured plan)
      ──► Execute (bounded ReAct loop with allowlisted tools)
      ──► Evaluate (objective checks first; agent cannot grade itself)
      ──► Reflect (what worked / failed / root cause / lesson)
      ──► Store (experience + deduplicated lesson + strategy stats)
      ──► Next task retrieves it all and behaves differently
```

Every stage is logged as an `AgentEvent`, visible live in the dashboard and via the API.

## Architecture

| Component | File(s) | Role |
|---|---|---|
| Orchestrator | `src/lib/agent/orchestrator.ts` | Drives the full loop; graceful per-stage failure handling |
| Task understanding | `src/lib/agent/understand.ts` | LLM → `{goal, category, keywords, risk, complexity}` (fail-open heuristic fallback) |
| Memory retrieval | `src/lib/agent/memory/retrieval.ts` | TF-IDF cosine similarity + category bonus + relevance threshold (no flooding) |
| Memory store | `src/lib/agent/memory/store.ts` | Experiences, lessons (near-duplicate **merging**), lesson usage stats, strategy stats |
| Planner | `src/lib/agent/planner.ts` | LLM → structured plan embedding retrieved lessons + recommended strategy (fail-open fallback) |
| Executor | `src/lib/agent/executor.ts` | Bounded ReAct loop (max 8 iterations), one tool call per step, observations fed back |
| Tool system | `src/lib/agent/tools/*` | Allowlisted registry, zod arg validation, timeouts, persisted `ToolExecution` log |
| Evaluator | `src/lib/agent/evaluator.ts` | Objective checks + automatic internal checks; LLM rubric only as marked-subjective fallback |
| Reflector | `src/lib/agent/reflector.ts` | LLM → structured reflection + one reusable lesson (fail-open) |
| Runner | `src/lib/agent/runner.ts` | Single agent mutex (serializes LLM usage), queue depth limit 8 |
| Benchmark | `src/lib/agent/benchmark.ts` | Fixed task set × modes A/B/C/D, real measured results |
| LLM wrapper | `src/lib/llm.ts` | JSON-mode with zod validation, retry w/ **exponential backoff on 429s**, timeouts |
| API | `src/app/api/*` | REST endpoints (see below) |
| Dashboard | `src/app/page.tsx` + `src/components/dashboard/*` | Live pipeline view, memory, strategies, metrics, experiment |

## Data model (Prisma / SQLite)

- **Task** — input, mode, status, plan, result, score, strategy, iterations, timestamps
- **Experience** — what happened: task summary, actions, outcome, score, approach used, keywords
- **Lesson** — what to remember: content, type (success/failure), confidence, keywords, `useCount` / `helpfulCount` (did it actually help later tasks?)
- **Strategy** — what procedure to use: name, category, `uses`, `successes`, `totalScore` → success rate
- **ToolExecution** — every tool call: args, result, success, duration
- **Evaluation** — checks array, score, objective flag
- **AgentEvent** — full observability timeline per task
- **BenchmarkRun** — experiment configurations and measured results

## Tools (allowlisted, validated, time-limited)

| Tool | Safety |
|---|---|
| `calculator` | Hand-written recursive-descent parser. **No `eval`/`Function`.** Rejects letters/injection |
| `code_executor` | `node:vm` sandbox: no `require`/`process`/`fs`/network in context, 2s timeout, size caps. *vm is isolation, not a hard security boundary — documented honestly* |
| `file_inspector` | Read-only, restricted to `sandbox/` dir, path-traversal protection, size/depth caps |
| `list_files` | Lists sandbox contents only |
| `web_search` | Server-side SDK function; snippet results only |
| `http_get` | GET-only, private/link-local IP blocking (SSRF guard), manual redirects ≤2 re-validated, 10s timeout, 512KB cap |

The `sandbox/` directory is bootstrapped automatically with demo files (`notes.txt`, `config/settings.yaml`).

## Evaluation — the agent cannot grade itself

If the submitter provides checks, they are ground truth (100% objective):

- `output_contains` — result contains expected (case-insensitive)
- `numeric_match` — a number in the result equals expected (± tolerance)
- `regex_match` — RegExp tests the result
- `js_expression` — sandboxed boolean JS with `result` bound (benchmark-grade checks)
- `tool_succeeded` — a named tool ran successfully

Automatic internal objective checks always run: no tool failures, non-empty result, no iteration exhaustion.

Only when no user checks exist does an LLM rubric contribute — at 50% weight, blended with the internal
objective checks, and explicitly marked `objective: false` in the stored evaluation.

## Modes (also the experiment variants)

| Mode | Retrieve | Store experiences | Store lessons | Strategy selection |
|---|---|---|---|---|
| `no_memory` (A) | ✗ | ✗ | ✗ | ✗ |
| `memory_only` (B) | ✓ | ✓ | ✗ | ✗ |
| `memory_reflection` (C) | ✓ | ✓ | ✓ | ✗ |
| `full` (D) | ✓ | ✓ | ✓ | ✓ |

## Setup & run

```bash
# 1. install dependencies
bun install        # or npm install

# 2. create .env with the database URL
echo 'DATABASE_URL=file:/home/z/my-project/db/custom.db' > .env

# 3. push the schema + generate the client
bun run db:push
bun run db:generate

# 4. run the dev server
bun run dev        # http://localhost:3000
```

The LLM is provided by `z-ai-web-dev-sdk`, which reads its config from `/etc/.z-ai-config` (or
`./.z-ai-config`). **No API keys are stored in the repository.**

## Testing

```bash
bun run db:push:test   # create the isolated test database
bun test               # 78 tests
bun run lint           # eslint
bunx tsc --noEmit      # typecheck
```

Coverage: calculator (incl. injection rejection), vm sandbox (no process/require, loop timeout), file sandbox
(traversal blocked), SSRF guards, retrieval similarity, memory store/dedup/usage stats, evaluator check types,
zod schema validation, tool registry allowlist, and a **full-loop integration test with a scripted LLM**
(cold start → lesson stored → second similar task retrieves it → failure case → mode gating).

## API

| Method & path | Purpose |
|---|---|
| `POST /api/tasks` | Submit `{input, checks?, mode?}` → 202 `{id}` (runs in background) |
| `GET /api/tasks?limit=100` | Task list + runner stats |
| `GET /api/tasks/{id}` | Full trace: events, tools, evaluation, reflection, lesson, memory retrieved |
| `DELETE /api/tasks/{id}` | Delete a non-running task |
| `GET /api/memory` | Lessons + experiences |
| `DELETE /api/memory` | Reset memory (lessons, experiences, strategies) |
| `GET /api/strategies` | Strategy performance |
| `GET /api/metrics` | Score sequence, first-half vs second-half improvement, top lessons |
| `POST /api/benchmark` | Launch `{taskSet: 'quick'\|'default'}` experiment |
| `GET /api/benchmark` | Latest benchmark runs + results |
| `GET /api` | Health check |

## Benchmark methodology (and honesty)

The experiment runs a **fixed task set with objective checks** (hard multiplications, sandbox file discovery,
nested config reads — see `src/lib/agent/presets.ts`) under the four modes A→D sequentially against the same
persistent database. For the cleanest comparison, reset memory first (UI button or `DELETE /api/memory`).

### Real measured results (quick set, 4 tasks × 4 modes, single run)

| Mode | Configuration | Mean score | Success rate | LLM calls |
|---|---|---|---|---|
| A | no memory | 0.75 | 75% | 17 |
| B | memory | 0.75 | 75% | 17 |
| C | memory + reflection | **1.00** | **100%** | 22 |
| D | + strategy | 0.75 | 75% | 14 |

**Honest interpretation:** every task that actually *ran* scored 1.0 in all modes — this base model already
uses tools well on these task families, so the loop operates at a **performance ceiling** and shows no
reliable score improvement from memory on this set. The mode variance above comes from tasks aborted by
**API rate limiting (HTTP 429)**, which is an environmental constraint of the LLM endpoint under sustained
load (A lost 1 task, B lost 1, D lost 1; C happened to run in a friendlier window). Treat single runs as
anecdotes: the framework exists to measure honestly, not to guarantee improvement.

Where the learning loop IS unambiguously demonstrated (real runs, see the live dashboard):

1. **Cold start** — new multiplication task, no memories retrieved → calculator used → score 1.0 → lesson
   stored: *"For exact integer multiplication tasks, always use the calculator tool…"*
2. **Similar task** — the lesson and experience were retrieved (similarity 0.36), the strategy
   `calculator_for_multiplication` was selected, the plan explicitly applied the lesson → score 1.0 → the
   near-duplicate lesson was **merged**, not duplicated.
3. **Transfer** — a word-problem phrasing (*"A factory produces 6472 units per day…"*) still retrieved the
   multiplication lesson → calculator → exact answer → **failure avoided via learned behavior**.
4. **Failure path** — a task with an unsatisfiable check (ground truth mismatch) → the agent reported the
   true state, the evaluator failed it (score 0), reflection extracted a **failure lesson** (confidence 0.8)
   which was stored as a new lesson.

### Known caveats (stated plainly)

1. **Shared database**: B/C/D see memories accumulated during earlier modes of the same run; reset before
   comparing.
2. **LLM non-determinism + rate limits**: results vary between runs; 429-aborted tasks score 0 and are
   clearly tagged with their error in the task history. The system retries with exponential backoff
   (10s/20s/40s), paces LLM calls globally (~2.5s spacing), serializes all agent work through one mutex,
   and cools down 90s after a throttled task — but a hard-throttling API still degrades long runs.
3. **Ceiling effect**: strong base models already use tools well; measurable improvement requires task
   families where the base agent genuinely fails (this set mostly doesn't).
4. **Lessons are only as good as the evaluation signal**: if a human supplies a wrong expected value, the
   agent will "fail" against wrong ground truth and learn a misleading lesson (observed in practice).

## Safety

- Tool allowlist; unknown tools rejected and logged
- Zod validation of **all** model-generated data before storage; raw LLM output is never trusted
- Execution timeouts everywhere (tools, vm, LLM calls); iteration budget (8); queue depth limit
- `node:vm` sandbox for code execution (documented limits) — no shell, no writes outside DB
- Read-only file access confined to `sandbox/`
- SSRF guards on outbound HTTP (private ranges blocked, GET only, size caps) — residual DNS-rebinding risk documented
- Secrets: `.env` is gitignored and untracked; LLM credentials live outside the repo; logs scrub key names matching secret patterns
- `db/*.db` and `sandbox/` are gitignored

## Limitations (honest list)

- Retrieval is **lexical** (TF-IDF keywords), not neural embeddings — good enough to demonstrate behavioral change, not semantic understanding
- Single-process queue (in-memory mutex): background tasks die if the server restarts mid-run (tasks stay in their last status; no resume)
- node:vm is not a hard security boundary against hostile code
- LLM rubric fallback remains self-evaluation (clearly flagged as subjective in stored data)
- The SQLite DB is a single file with no migrations beyond `db push` (fine for an MVP)
- No auth on the API (single-user demo system)

## Future improvements

- Embedding-based retrieval + vector index
- True model-weight training (fine-tuning on successful traces) — explicitly out of scope for the MVP
- Human feedback loop into lesson confidence
- Resume-on-restart for interrupted tasks
- Multi-agent strategy arbitration
