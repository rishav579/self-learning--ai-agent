# Worklog

---
Task ID: 1
Agent: main (Super Z)
Task: Build the Self-Improving AI Agent MVP end-to-end from a greenfield scaffold

Work Log:
- Inspected repo: greenfield Next.js 16 scaffold, LLM SDK verified live ("PONG"), Prisma+SQLite wired
- Fixed security hygiene: untracked .env from git, extended .gitignore
- Data model: 8 Prisma models (Task, Experience, Lesson, Strategy, ToolExecution, Evaluation, AgentEvent, BenchmarkRun) + db push
- LLM wrapper (src/lib/llm.ts): JSON-mode chat with zod validation, balanced-brace JSON extraction, retry with error feedback, per-call timeout
- Tool system: registry allowlist + zod arg validation + timeouts + persisted logging; calculator (hand-written parser, no eval), code_executor (node:vm sandbox), file_inspector/list_files (sandbox-restricted, traversal-blocked), web_search (SDK), http_get (SSRF-guarded)
- Memory: TF-IDF cosine retrieval with threshold + category bonus; lesson dedup/merge; usage stats (helpful/notHelpful); strategy stats with Laplace-ranked selection
- Evaluator: objective checks (output_contains, numeric_match, regex, js_expression, tool_succeeded) + automatic internal checks; LLM rubric only as marked-subjective 50% fallback
- Pipeline: understand → retrieve → strategy → plan → execute (ReAct, max 8 iters) → evaluate → reflect → store; all stages fail-open/graceful; AgentEvent timeline
- Runner: single agent mutex, queue depth 8; benchmark serialized through same lock
- API: /api/tasks (POST/GET), /api/tasks/[id] (GET/DELETE), /api/memory (GET/DELETE reset), /api/strategies, /api/metrics, /api/benchmark (POST/GET), /api health
- UI: single-page dashboard with 6 tabs (Dashboard/Tasks/Memory/Strategies/Improvement/Experiment), live polling (2s), submit form with presets, task stepper + panels, recharts visualizations
- Tests: 78 bun tests incl. full-loop integration with scripted LLM
- E2E: real LLM task verified full loop; found and fixed race condition (unawaited setStatus overwrote completed status in no_memory mode)

Bugs found & fixed:
1. llm.ts syntax error (stray paren) — fixed
2. Task.strategyName missing from Prisma schema — added + re-push
3. calculator token type cast error — fixed with OpChar type
4. RACE CONDITION: setStatus() fire-and-forget → 'storing' overwrote 'completed' in no_memory mode → all setStatus now awaited
5. http-get isPrivateIp not exported — fixed
6. LLM API 429 rate limiting killed benchmark modes B/C/D → added exponential backoff (2s/4s/8s for 429s), benchmark serialized through agent lock, 2.5s inter-task pacing
7. chain-rejection cascade risk in runner after withAgentLock refactor — fixed (lock maintains the chain)
8. Bench arithmetic expected values were wrong (my own mental math!) — verified all with Python: 8347*2953=24648691, 7261*4018=29174698, (1793+847)*61=161040, fib15=610, fib20=6765, 4659*8831=41143629

Stage Summary:
- 78/78 tests pass, tsc clean, eslint clean, dev server healthy
- Real E2E task verified: understanding → retrieval → strategy → plan → calculator → objective eval (1.0) → reflection → lesson stored
- Learning loop verified live: task 2 retrieved task-1's lesson, selected its strategy, planned accordingly
- Honest observation recorded: wrong human-provided check value (7382*4451) made the agent "fail" against a wrong ground truth and learn a misleading lesson — documented as a limitation of experience-driven learning
- Next: neutralize pre-loaded "use calculator" guidance in executor prompt so the benchmark measures learning honestly, then re-run experiment

---
Task ID: 2
Agent: main (Super Z)
Task: Rate-limit resilience, real benchmark run, learning demonstration, docs

Work Log:
- Diagnosed 429 rate-limit aborts killing benchmark modes; implemented 3 root-cause fixes:
  1. Exponential backoff 10s/20s/40s (capped 60s) for transient errors, 4 default attempts
  2. Global LLM rate limiter (paced(): min 2.5s between ANY two LLM requests, process-wide)
  3. Benchmark serialized through the same agent mutex + 8s inter-task pacing + 90s cooldown after throttled tasks
- Fixed chain-rejection cascade risk (withAgentLock maintains a never-rejecting chain)
- Neutralized pre-loaded "always use calculator" guidance in executor/tool prompts so the experiment measures LEARNING, not prompt engineering
- Reflector raised to 4 retry attempts (lesson extraction is core to the loop)
- Ran the real quick benchmark (4 tasks x 4 modes) to completion: A 0.75 / B 0.75 / C 1.00 / D 0.75 (all executed tasks scored 1.0; mode variance from 429-killed tasks — reported honestly)
- Ran the final 4-task learning demonstration with real LLM:
  T1 cold start -> calculator -> score 1.0 -> lesson stored
  T2 similar -> lesson retrieved (sim 0.36) + experience + strategy calculator_for_multiplication -> plan applies lesson -> score 1.0 -> duplicate lesson MERGED
  T3 word-problem transfer -> lesson retrieved -> failure avoided -> score 1.0
  T4 ground-truth-mismatch failure -> objective check failed it -> failure lesson stored (confidence 0.8)
- UI verified with agent-browser: all 6 tabs render, live pipeline stepper, preset chips fill form, submit works, benchmark tab live-updates, mobile viewport OK, zero page errors
- README rewritten with architecture, API, testing, real benchmark results + honest interpretation, safety, limitations
- Cleaned up: probe script removed, tsc clean, eslint clean, 78/78 tests pass

Stage Summary:
- System complete and verified end-to-end with real LLM runs
- All 9 final-verification categories green
- Honest findings documented: ceiling effect on benchmark task set; API rate limiting is the dominant environmental constraint; lessons inherit quality of evaluation signal

---
Task ID: 3
Agent: main (Super Z)
Task: FINAL HARDENING AND ADVERSARIAL AUDIT (break the system, fix, verify)

Work Log:
- Full re-inspection of all agent/API/UI/DB/config files; baseline 78/78 tests, tsc clean, lint clean
- SECURITY (critical): found and FIXED two real node:vm sandbox escapes (arbitrary host code execution):
  1. code_executor injected host-realm builtins (Math/Object/Array/...) → `this.constructor.constructor("return process")()` compiles in the HOST realm, bypassing codeGeneration:false — verified live ("ESCAPED") before fixing
  2. evaluator js_expression passed a host `numbers` array → `numbers.constructor.constructor(...)` — same class, verified live
  Fix (both): null-prototype sandbox, ZERO host objects injected (fresh context intrinsics), console built in-context from a null-prototype callback, globalThis prototype severed, codeGeneration disabled, fail-closed hardening step. 12+ escape vectors regression-tested; prototype pollution of host builtins now impossible (own realm)
- llm.ts refactored with injectable transport + backoff → 21 resilience tests (429 storms, timeouts, malformed/prose/fenced JSON, schema-invalid retry+feedback, dead-LLM degradation of understand/plan/reflect/evaluate)
- isTransientError extended (econn/socket/fetch failed)
- Runner fixes: queued/running double-count bug (stats inflated), queue-full check now queued+running, restart recovery via src/instrumentation.ts (in-flight→failed "interrupted by restart", pending→re-enqueued, verified E2E on production), state moved to globalThis (survives dev hot-reload; found busy-guard silently broken by module reload — verified fixed)
- Memory anti-poisoning: Lesson.retired column + auto-retirement (>=3 uses, helpfulRate<0.35), retrieval excludes retired + trust-weighting (confidence ±10%, helpful-rate penalty), near-duplicate EXPERIENCE dedup-merge (similarity>=0.9) — repeated identical tasks leave 1 row (E2E tested)
- Retrieval query enrichment (input + understanding.goal + keywords) for reliable cross-task lesson transfer
- safeParseChecks now validates entries via CheckSpecSchema (corrupted checks dropped, not phantom-failed)
- http_get SSRF verified against hex/decimal/octal IPv4, IPv6 mapped/ULA/link-local, credentials, non-http protocols, internal names, TEST-NET black hole (timeout abort path)
- Benchmark redesigned: hard v1 (bare-number trap) ran for real → mode A scored 100% (ceiling CONFIRMED, reported honestly); v2 = ANSWER:-convention trap (checkers demand ^ANSWER: [0-9]+$, unguessable, learnable only via stored+retrieved failure lesson) + memory reset per mode (controlled A/B/C/D) + efficiency metrics (llmCalls/iterations/duration)
- v1 benchmark completed: A=1.00/100%, B=0.667, C=0.667 (B/C degraded by 429-killed tasks), D=0.00 (all six 429-killed — hourly API quota exhausted; environmental, honestly reported)
- Production hardening: build now type-checks (removed scaffold's ignoreBuildErrors), start script exports DATABASE_URL (standalone server does not load .env!) + pins AGENT_SANDBOX_DIR (standalone cwd differs from dev)
- Production build succeeded; standalone server started; health/API/frontend OK; restart-recovery E2E verified on production (orphan→failed, pending→re-enqueued)
- Memory-route reset now 409s while agent busy; safeJson deduplicated into src/lib/api-helpers.ts
- UI verified on production: 6 tabs, mobile viewport 390x844, failed-task error alert ("interrupted by a server restart..."), live polling, benchmark running state, no page errors
- Perf measured (14 real completed benchmark tasks): mean 5 LLM calls/task (bounded), 3 iterations, ~28s/task dominated by API pacing; tools 0-2ms
- Tests: 172/172 pass (87 new adversarial/resilience/recovery), tsc clean, eslint clean

Bugs found & fixed this session:
1. RCE via vm sandbox host-builtin injection (code_executor + evaluator) — fixed + regression-tested
2. Runner double-counting inflight tasks in stats (queued never decremented at start)
3. In-memory queue lost ALL tasks on restart with no reconciliation — recovery implemented + verified
4. Busy-guard/queue state silently reset by dev hot-reload module re-instantiation — globalThis state
5. Misleading comment: retrieval claimed confidence-biased ranking but never used confidence — now actually weighted
6. Corrupted checks JSON phantom-failed tasks — now validated+dropped
7. Production standalone would not find .env DATABASE_URL — exported in start script
8. Standalone server cwd would bootstrap a different sandbox — AGENT_SANDBOX_DIR pinned
9. ECONNREFUSED-class errors not retried as transient
10. Evaluator js_expression host-array RCE — fixed same as (1)
11. safeJson duplicated in 3 routes — consolidated
12. LLM interface dead `chat` method — removed

Stage Summary:
- Security posture materially improved (2 verified RCEs closed); adversarial suite of 87 tests guards regressions
- System survives: empty/long/malformed inputs, unknown tools, invalid args, timeouts, 429 storms, DB corruption, restarts mid-task, concurrent bursts (load shedding verified: 8 accepted / 4 rejected 429)
- Hard v1 benchmark honestly showed the ceiling; v2 (convention trap) designed to make memory matter — pending API quota recovery to run
- Remaining: v2 benchmark run + failure-learning demo (blocked on LLM quota window), final README numbers, final production rebuild with latest code

---
Task ID: 4
Agent: main (Super Z)
Task: Final audit wrap-up — production verification, deterministic benchmark proof, docs

Work Log:
- LLM API quota exhausted ~12:05 UTC after v1 benchmark (~150 calls in 40 min); probed every ~10 min for 2h+ — never recovered (long-window quota). Live hard-v2 A/B/C/D + live failure-learning sequence blocked environmentally; documented honestly in README
- benchmark.ts: interTaskPauseMs injectable for tests
- tests/benchmark-hard.test.ts (3 tests): deterministic mechanism proof with prompt-aware scripted LLM — A all-traps-fail (cannot know hidden convention), B ≈ A (experiences carry outcomes not causes), C: trap#1 fails → failure lesson stored → traps #2/#3 PASS via retrieved lesson (asserted via event timeline: memory_retrieved with lesson content, result 'ANSWER: 32143993'), D ≥ C + strategy 'answer-prefix-convention' recorded. Learning channel verified (lesson text reached executor prompt only in C/D)
- safeJson deduplicated → src/lib/api-helpers.ts; scaffold ignoreBuildErrors removed (build now type-checks)
- Production rebuilt twice (final build includes all changes); standalone server healthy: all API endpoints 200 in <12ms; HTTP validation adversarial checks (empty/long/bad-check/invalid-JSON/bogus-taskSet → 400; unknown id → 404)
- UI verified on production: 6 tabs, mobile 390×844, failed-task alert, live polling, screenshots saved
- git commit b7e71c9 (37 files, +2219/−267); no secrets tracked (verified)
- Real-LLM full-loop evidence extracted from this session's DB: task_started → understanding → memory_retrieved → strategy_selected → plan_created → iterations → evaluation(1.0 objective) → reflection → lesson_stored → experience_stored → strategy_updated → task_completed (lesson: 'use calculator for large-integer multiplication'; strategy: calculator_for_multiplication)
- Mode B v1 evidence: later tasks retrieved prior successful experiences and plans followed the proven approach (code_executor for fib, calculator for arithmetic) — real behavioral adaptation via memory
- v1 honest finding #2: mode C trap#2 retrieved ZERO lessons from trap#1 (lexical wording mismatch between near-identical tasks) → motivated + implemented query enrichment (input + goal + keywords)

Stage Summary:
- FINAL STATE: 175/175 tests, tsc clean, eslint clean, production build + server verified, restart recovery verified E2E, 2 RCEs fixed, memory safeguards in, benchmark v2 mechanism proven deterministically, honest docs
- Live v2 benchmark remains the single item blocked by external API quota — commands to run it are documented

---
Task ID: 5
Agent: main (Super Z)
Task: Final independent release audit (release candidate verification)

Work Log:
- Verified git: branch main, clean tree, HEAD db48366 (hardening commit b7e71c9 present locally)
- CRITICAL FINDING: NO remote configured; GitHub repo https://github.com/rishav579/self-learning--ai-agent.git exists but is COMPLETELY EMPTY (ls-remote returns zero refs); no push credentials in environment (no ~/.git-credentials, no ~/.ssh, no gh, no token) — push impossible from this sandbox; remote 'origin' added and configured so the user can push with one command
- Executed all 4 gates: bun test → 175 pass / 0 fail (15 files, 475 expect, 19.4s); bunx tsc --noEmit → clean (exit 0); bun run lint → clean (exit 0); bun run build → success (compiled 16.3s, 9 routes, standalone output)
- Security scan: .env tracked? NO (gitignored; contains only DATABASE_URL sqlite path); .env appears in history only at initial commit with the same harmless sqlite path — never any API key; git grep for sk-/ghp_/AKIA/private-key/Bearer patterns across HEAD → zero matches; node_modules/.next/db/*.db/*.log/sandbox/tsbuildinfo all untracked; server.log contains only Next startup output; no benchmark JSON/CSV artifacts anywhere
- README honesty verified against DB: BenchmarkRun table has exactly 1 completed run (hard v1, all 4 modes) with A=1.0/100%, B=0.667, C=0.667, D=0.0 (D per-task llmCalls=0 = quota-killed) — README numbers match DB records EXACTLY; zero tasks with v2 ANSWER:-trap wording → v2 never ran live, exactly as README states; cold-start real-LLM learning-loop evidence verified in AgentEvent (task cmtr5e3k full 14-event timeline: task_started → ... → lesson_stored → experience_stored → strategy_updated → task_completed, score=1, lesson 'multiplication → calculator', strategy calculator_for_multiplication)
- Overclaim scan: no 'production-ready'/AGI/security-guarantee phrasing anywhere in tracked files
- Production smoke boot: standalone server started, /api health=ok database=connected, /api/tasks, /api/metrics, /api/benchmark all 200, frontend 200 (29285 bytes); server then stopped
- Fixes applied: README release-status banner added (exact phrasing 'Portfolio-ready / hardened MVP — not production-ready' + pointer to limitations); audit verification scripts (scripts/audit-db-verify.ts, scripts/audit-evidence-verify.ts) added for reproducibility

Stage Summary:
- Release candidate PASSES all local gates (tests/typecheck/lint/build/prod boot) and every honesty claim is DB-verified
- Single release blocker: the GitHub repository is EMPTY — project never pushed; requires credentials the sandbox does not have
- Final verdict: Portfolio-ready / hardened MVP, conditional on user running: git push -u origin main
