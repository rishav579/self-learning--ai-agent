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
      ──► Retrieve memory (TF-IDF similar lessons + experiences, thresholded,
            query enriched with the understanding's goal + keywords)
      ──► Select strategy (Laplace-ranked by past success rate)
      ──► Plan (zod-validated structured plan)
      ──► Execute (bounded ReAct loop with allowlisted tools)
      ──► Evaluate (objective checks first; agent cannot grade itself)
      ──► Reflect (what worked / failed / root cause / lesson)
      ──► Store (experience + deduplicated lesson + strategy stats)
      ──► Next task retrieves it all and behaves differently
```

Every stage is logged as an `AgentEvent` — a complete task trace (`GET /api/tasks/{id}`) shows:
task → understanding → retrieval (with similarity scores) → strategy → plan → per-iteration
thoughts/tool calls/observations → evaluation (per-check pass/fail) → reflection → stored lesson →
experience → strategy statistics. Secrets are never logged (key names matching secret patterns are scrubbed).

## Architecture

| Component | File(s) | Role |
|---|---|---|
| Orchestrator | `src/lib/agent/orchestrator.ts` | Drives the full loop; graceful per-stage failure handling |
| Task understanding | `src/lib/agent/understand.ts` | LLM → `{goal, category, keywords, risk, complexity}` (fail-open heuristic fallback) |
| Memory retrieval | `src/lib/agent/memory/retrieval.ts` | TF-IDF cosine similarity + category bonus + trust weighting + relevance threshold; retired lessons excluded |
| Memory store | `src/lib/agent/memory/store.ts` | Experiences (near-duplicate **merging** — no flooding), lessons (dedup + usage stats + **auto-retirement**), strategy stats |
| Planner | `src/lib/agent/planner.ts` | LLM → structured plan embedding retrieved lessons + recommended strategy (fail-open fallback) |
| Executor | `src/lib/agent/executor.ts` | Bounded ReAct loop (max 8 iterations), one tool call per step, observations fed back |
| Tool system | `src/lib/agent/tools/*` | Allowlisted registry, zod arg validation, timeouts, persisted `ToolExecution` log |
| Evaluator | `src/lib/agent/evaluator.ts` | Objective checks + automatic internal checks; LLM rubric only as marked-subjective fallback |
| Reflector | `src/lib/agent/reflector.ts` | LLM → structured reflection + one reusable lesson (fail-open) |
| Runner | `src/lib/agent/runner.ts` | Single agent mutex, queue depth limit 8, restart recovery; state on globalThis (hot-reload safe) |
| Benchmark | `src/lib/agent/benchmark.ts` | Fixed task set × modes A/B/C/D, memory reset per mode (controlled comparison), efficiency metrics |
| LLM wrapper | `src/lib/llm.ts` | JSON-mode with zod validation, retry w/ exponential backoff on 429s, timeouts, injectable transport for tests |
| Startup recovery | `src/instrumentation.ts` | Reconciles orphaned tasks on server boot |
| API | `src/app/api/*` | REST endpoints (see below) |
| Dashboard | `src/app/page.tsx` + `src/components/dashboard/*` | Live pipeline view, memory, strategies, metrics, experiment |

## Data model (Prisma / SQLite)

- **Task** — input, mode, status, plan, result, score, strategy, iterations, LLM calls, timestamps
- **Experience** — what happened: task summary, actions, outcome, score, approach used, keywords
  (near-duplicate tasks are **merged**, not multiplied)
- **Lesson** — what to remember: content, type (success/failure), confidence, keywords, `useCount` /
  `helpfulCount` / `notHelpfulCount`, `refinements`, **`retired`** (poisoning safeguard)
- **Strategy** — what procedure to use: name, category, `uses`, `successes`, `totalScore` → success rate
- **ToolExecution** — every tool call: args, result, success, duration
- **Evaluation** — checks array, score, objective flag
- **AgentEvent** — full observability timeline per task
- **BenchmarkRun** — experiment configurations and measured results

## Memory safeguards (anti-poisoning)

Learning from experience can poison future behavior if bad lessons stick around. Four safeguards:

1. **Deduplication / merging** — lessons ≥ 0.72 similarity are merged (confidence reinforced, stats bumped);
   experiences ≥ 0.90 similarity update the existing row. Repeating the same task 20 times leaves 1 row.
2. **Usage tracking** — every retrieved lesson is graded `helpful` (task scored ≥ 0.75) or `notHelpful`.
3. **Retirement** — a lesson retrieved ≥ 3 times with a helpful rate < 0.35 is marked `retired` and
   **excluded from retrieval**. Fresh, strong evidence (a new near-duplicate lesson) un-retires it.
4. **Trust weighting** — lessons with ≥ 2 uses and a poor helpful rate are ranked down (×0.55–1.0);
   unproven lessons keep full weight. Retrieval similarity always dominates.

## Tools (allowlisted, validated, time-limited)

| Tool | Safety |
|---|---|
| `calculator` | Hand-written recursive-descent parser. **No `eval`/`Function`.** Rejects letters/injection |
| `code_executor` | **Hardened** `node:vm` sandbox: null-prototype context, **zero host-realm objects injected** (host builtins leak the host `Function` constructor — a verified RCE, see Security), `codeGeneration` disabled, 2s timeout, size caps |
| `file_inspector` | Read-only, restricted to `sandbox/` dir (`AGENT_SANDBOX_DIR` overridable), path-traversal protection, size/depth caps |
| `list_files` | Lists sandbox contents only |
| `web_search` | Server-side SDK function; snippet results only |
| `http_get` | GET-only, private/link-local/CGNAT IP blocking incl. hex/decimal IPv4 forms (SSRF guard), manual redirects ≤ 2 re-validated, 10s timeout, 512KB cap |

The `sandbox/` directory is bootstrapped automatically with demo files (`notes.txt`, `config/settings.yaml`).

## Evaluation — the agent cannot grade itself

If the submitter provides checks, they are ground truth (100% objective):

- `output_contains` — result contains expected (case-insensitive)
- `numeric_match` — a number in the result equals expected (± tolerance)
- `regex_match` — RegExp tests the result
- `js_expression` — boolean JS expression evaluated in a **hardened vm context** (`result` and `numbers` bound; no host constructor path — see Security)
- `tool_succeeded` — a named tool ran successfully

Automatic internal objective checks always run: no tool failures, non-empty result, no iteration exhaustion.

Only when no user checks exist does an LLM rubric contribute — at 50% weight, blended with the internal
objective checks, and explicitly marked `objective: false` in the stored evaluation. Corrupted check rows in
the database are validated and dropped (never silently fail tasks).

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

### Production

```bash
bun run build      # next build (standalone output)
bun run start      # NODE_ENV=production, AGENT_SANDBOX_DIR pinned to the project sandbox
```

`AGENT_SANDBOX_DIR` matters in production: the standalone server runs from `.next/standalone/`, and without
pinning, the file tools would bootstrap a *different* sandbox there.

The LLM is provided by `z-ai-web-dev-sdk`, which reads its config from `/etc/.z-ai-config` (or
`./.z-ai-config`). **No API keys are stored in the repository** (`.env` is gitignored and untracked).

## Testing

```bash
bun run db:push:test   # create the isolated test database
bun test               # 175 tests
bun run lint           # eslint
bunx tsc --noEmit      # typecheck
```

Coverage: calculator (incl. injection rejection), **hardened vm sandbox (12 escape vectors tested)**,
SSRF guards (literal/numeric/hex IPs, protocols, credentials, internal names, timeout path), file-sandbox
traversal, retrieval similarity + threshold, memory store/dedup/usage stats/retirement/un-retirement,
corrupted memory rows, evaluator check types (incl. js_expression escape + timeout), zod schema validation,
tool registry allowlist, **LLM resilience (429 storms, timeouts, malformed JSON, prose-wrapped JSON,
schema-invalid retries, dead-LLM degradation of every pipeline stage)**, **runner (load shedding, crash
containment, serialization, restart recovery, persistence)**, and a **full-loop integration test with a
scripted LLM** (cold start → lesson stored → second similar task retrieves it → failure case → mode gating),
plus full-pipeline adversarial tests (unknown tools, invalid args, 2000-char inputs, repeated tasks), and the hard-benchmark v2 mechanism test (scripted prompt-aware LLM proving the A≈B < C≤D capability gradient and the failure→lesson→retrieval→pass trace deterministically).

## API

| Method & path | Purpose |
|---|---|
| `POST /api/tasks` | Submit `{input, checks?, mode?}` → 202 `{id}` (runs in background); 429 when the queue is full |
| `GET /api/tasks?limit=100` | Task list + runner stats |
| `GET /api/tasks/{id}` | Full trace: events, tools, evaluation, reflection, lesson, memory retrieved |
| `DELETE /api/tasks/{id}` | Delete a non-running task (409 while running) |
| `GET /api/memory` | Lessons + experiences |
| `DELETE /api/memory` | Reset memory (409 while the agent is busy) |
| `GET /api/strategies` | Strategy performance |
| `GET /api/metrics` | Score sequence, first-half vs second-half improvement, top lessons |
| `POST /api/benchmark` | Launch `{taskSet: 'quick'\|'default'\|'hard'}` experiment |
| `GET /api/benchmark` | Latest benchmark runs + results |
| `GET /api` | Health check |

## Benchmark methodology (and honesty)

Three task sets: `default` / `quick` (arithmetic, file discovery, algorithms) and `hard` (v2, below).
The **hard** set resets memory **before each mode** so A/B/C/D all start from the same clean state and only
accumulate their own experience — a controlled comparison of capability levels, not a cumulative sequence.
All results are recorded as they actually happened. Efficiency (LLM calls, iterations, duration) is measured
alongside score, because memory legitimately helps even when scores hit a ceiling.

### The hard set (v2) and why it exists

The honest history of the benchmark design:

1. The **default set** has a ceiling effect: a competent base LLM with the tool catalog solves every task
   first-try, so modes A–D converge to the same score.
2. **Hard v1** used a hidden bare-integer format check (`^[0-9]+$`). Measured result: **mode A scored
   100% anyway** — the base model already answers "Compute X." tasks with a bare number. Another ceiling,
   reported honestly.
3. **Hard v2** uses an **output-convention trap**: the checker requires the answer in the exact form
   `ANSWER: <integer>`. Nothing in the task text reveals this convention and no natural LLM style produces
   it, so a first-time agent objectively fails. The only way later tasks pass is a stored + retrieved lesson.
   This models real-world output contracts (API schemas, report formats): information the agent genuinely
   cannot have without experience. **No lesson text is ever hard-coded into prompts.** Sandbox-fact tasks
   remain solvable by all modes but reward memory with fewer discovery steps.

### Real measured results

**Hard v1 (hidden bare-integer format check) — real LLM, single run, 6 tasks × 4 modes:**

| Mode | Configuration | Mean score | Success rate | Note |
|---|---|---|---|---|
| A | no memory | **1.00** | **100%** | base LLM already answers "Compute X." with a bare number — **ceiling confirmed** |
| B | memory | 0.667 | 67% | 2 tasks killed by API 429s (scored 0) |
| C | memory + reflection | 0.667 | 67% | 2 tasks killed by API 429s |
| D | + strategy | 0.00 | 0% | all 6 tasks killed by 429s (hourly quota exhausted) |

Honest reading: v1 produced **no learning signal because mode A solved it anyway** (the trap wasn't a
trap), and the later modes were degraded by environmental rate limiting, not by capability. Every
executed task that ran to completion scored 1.0. This run is why v2 exists.

A second real finding from v1: mode C's second multiplication task retrieved **zero** lessons from mode
C's first task (lexical retrieval failed to match near-identical tasks because the lesson's wording
shared no task vocabulary) — this motivated the **query enrichment** fix (retrieval now queries with the
task input + the understanding module's goal + keywords).

**Hard v2 (ANSWER:-convention trap) — deterministic mechanism proof (scripted, prompt-aware LLM, no network):**

Because the LLM endpoint exhausted its hourly quota during the v1 run, v2's live A/B/C/D run was blocked
for the remainder of the audit window. The mechanism is instead proven deterministically in
`tests/benchmark-hard.test.ts` (scripted LLM that — exactly like a real LLM — can only "know" the
convention if the retrieved lesson text actually appears in its prompt):

| Mode | Expected & measured outcome |
|---|---|
| A | All 3 convention traps FAIL (cannot know the hidden convention) — mean 0.39 |
| B | Traps still FAIL (experiences carry outcomes, not causes) — mean ≈ A |
| C | Trap #1 fails (learning moment) → failure lesson stored → traps #2/#3 **PASS** — mean 0.83 |
| D | ≥ C, plus the `answer-prefix-convention` strategy is recorded with usage stats |

The test also asserts the full learning trace in the event timeline: T1 objective failure → reflection
extracts the convention lesson → T2 retrieves it (visible in `memory_retrieved` with similarity) →
executor formats `ANSWER: 32143993` → objective pass. This is the failure→learning loop, proven at the
machinery level without network dependency.

**Where the learning loop IS demonstrated with the real LLM** (runs before quota exhaustion):

1. **Cold start** — new multiplication task, no memories → calculator used → objective score 1.0 →
   lesson stored: *"For multiplication tasks involving large integers, always use the…"* → strategy
   `calculator_for_multiplication` recorded (uses=1, successes=1) — full event timeline verified live.
2. **Restart recovery** (production, real server): a task mid-flight when the server was killed was
   marked `failed` with "interrupted by a server restart"; a queued-but-never-started task was
   re-enqueued automatically on boot and executed.
3. Prior sessions (see worklog) additionally demonstrated: similar-task retrieval (sim 0.36) with the
   plan explicitly applying the lesson, near-duplicate lesson merging, word-problem transfer, and a
   ground-truth-mismatch failure storing a failure lesson (confidence 0.8).

### Known caveats (stated plainly)

1. **LLM non-determinism + rate limits**: results vary between runs; 429-aborted tasks score 0 and are
   clearly tagged with their error. The system retries with exponential backoff (10s/20s/40s), paces LLM
   calls globally (~2.5s spacing), serializes all agent work through one mutex, and cools down 90s after a
   throttled task — but a hard-throttling API still degrades long runs.
2. **Lessons are only as good as the evaluation signal**: if a human supplies a wrong expected value, the
   agent will "fail" against wrong ground truth and learn a misleading lesson (observed in practice — the
   retirement safeguard eventually removes repeatedly-unhelpful lessons, but not instantly).
3. **Lexical retrieval**: lesson transfer depends on the lesson wording sharing vocabulary with the task;
   query enrichment (goal + keywords) mitigates but does not eliminate this.
4. Single runs are anecdotes, not statistics: the framework exists to measure honestly, not to guarantee
   improvement.

## Security

- Tool allowlist; unknown tools rejected and logged; zod validation of **all** model-generated data before
  storage — raw LLM output is never trusted
- Execution timeouts everywhere (tools 2–30s, vm 2s, LLM calls 90–120s); iteration budget (8); queue depth
  limit (8); request-body validation on every API route
- **Hardened `node:vm` sandbox** — during the adversarial audit we found and fixed a **real escape**:
  injecting host-realm builtins (`Math`, `Object`, `Array`, …) into the sandbox gave agent code a path to the
  HOST `Function` constructor (`this.constructor.constructor("…")` compiles in the host realm, where
  `codeGeneration: {strings:false}` does not apply) → arbitrary host code execution. The same class of bug
  existed in the evaluator's `js_expression` check via the host `numbers` array. Both are fixed with the same
  construction: null-prototype sandbox, **no host objects injected** (a fresh vm context has its own
  intrinsics), `console` built inside the context from a null-prototype callback, `globalThis` prototype
  severed from inside, `codeGeneration` disabled. 12+ escape vectors are regression-tested.
- **Honest limitation**: `node:vm` is still not a cryptographic security boundary (per Node.js docs). Our
  hardening blocks every escape vector we know of and could test (constructor chains from `this`, literals,
  intrinsics, `console`, error objects; `eval`/`Function`; prototype mutation of host builtins is now
  impossible because the context uses its own realm intrinsics). For truly hostile input, run untrusted code
  in a separate process/worker with resource limits — out of scope for this MVP.
- Read-only file access confined to `sandbox/` (residual risk: a symlink planted inside `sandbox/` by a host
  user would be followed — the agent itself has no write tool)
- SSRF guards on outbound HTTP (private ranges incl. CGNAT, link-local, IPv6 ULA/mapped, numeric/hex IPv4
  forms; GET only; credentials rejected; redirects re-validated; size caps). **Residual DNS-rebinding /
  TOCTOU risk is documented, not fully mitigated** — an egress proxy would be needed.
- Prompt injection: task text flows into LLM prompts; the tool allowlist/validation/SSRF guards are the
  actual barrier (a hostile task cannot obtain capabilities the tools don't expose). Documented as inherent.
- Secrets: `.env` gitignored and untracked; LLM credentials live outside the repo; logs scrub key names
  matching secret patterns; `db/*.db` and `sandbox/` gitignored

## Observability

Every task is traceable end-to-end by task ID (UI dashboard or `GET /api/tasks/{id}`):
`task_started → understanding → memory_retrieved (similarities) → strategy_selected → plan_created →
iteration (thoughts + tool calls) → execution_finished → evaluation (per-check) → reflection →
lesson_stored (dedup info) → experience_stored → strategy_updated → task_completed`, with durations.
Structured logs (`[tag] {json}`) are greppable per stage; secret-looking keys are scrubbed.

## Limitations (honest list)

- **The agent queue is in-memory (single process)** — MVP limitation. On restart, interrupted tasks are
  marked `failed` (never auto re-run; tool side effects may exist) and never-started tasks are re-enqueued
  (recovery runs at server boot via `instrumentation.ts`). A durable job store (Redis/BullMQ) would be the
  production upgrade.
- Retrieval is **lexical** (TF-IDF keywords), not neural embeddings — good enough to demonstrate behavioral
  change, not semantic understanding
- `node:vm` is not a hard security boundary against hostile code (see Security)
- LLM rubric fallback remains self-evaluation (clearly flagged as subjective in stored data)
- SQLite single file, no migrations beyond `db push` (fine for an MVP); SQLite has limited concurrent-write
  throughput (the agent mutex serializes writes, which also protects this)
- No auth / rate limiting on the API itself (single-user demo system) — do not expose it publicly
- **No model-weight training**: improvement is bounded by retrieval quality and lesson quality, not by
  gradient updates

## Future improvements

- Embedding-based retrieval + vector index
- True model-weight training (fine-tuning on successful traces) — explicitly out of scope for the MVP
- Human feedback loop into lesson confidence
- Durable persistent job queue
- Multi-agent strategy arbitration
