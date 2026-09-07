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
