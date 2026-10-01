# GitHub Portfolio Action Matrix

This document provides a repository-by-repository technical Action Matrix for all 15 public repositories owned by **rishav579**, derived directly from the evidence-calibrated `GITHUB_REPO_AUDIT.md`.

---

# Portfolio-Wide Strategic Summary

### Recurring Cleanup Themes
- **Scaffold Dependency Pruning**: Next.js repositories initialized from a shared boilerplate (`meridian-market`, `rishav-portfolio-starter`) retain `"z-ai-web-dev-sdk"` in `package.json` despite not importing or using it in their source code.
- **Environment Variable Fallback Standardization**: Absolute machine path fallbacks (such as `/home/z/my-project/db/custom.db`) in `self-learning--ai-agent` script files should be updated to relative defaults (`file:./db/custom.db`) for portability across environments.
- **Icon / Metadata URL Cleanup**: External scaffold logo references (`https://z-cdn.chatglm.cn/z-ai/static/logo.svg`) in `self-learning--ai-agent/src/app/layout.tsx` should be replaced with local public assets.

### Recurring Technical Strengths
- **Runtime Schema Validation**: Strict Pydantic schemas in Python FastAPI backends and Zod schemas in Next.js TypeScript APIs prevent unvalidated data from reaching ORMs or business logic.
- **Security-First AI Architecture**: Widespread implementation of governance guardrails, including multi-tenant SQL metadata filtering in `secure-enterprise-rag`, human-in-the-loop sign-off state machines in `OWNARA-AI` and `bhashini-voice-gateway`, and null-prototype `node:vm` sandboxing in `self-learning--ai-agent`.

### Testing & Deployment Evidence Gaps
- **Local Test Execution**: While `self-learning--ai-agent` has 175 passing tests verified via local execution, test suites in other repositories (`enterprise-ai-investigation`, `epoxy-distributed-ai-router`, `sahayak`, `secure-enterprise-rag`, `AGENT-LENS-`) exist as static files but were not executed in this audit session.
- **Live Deployment Verification**: Containerization files (`Dockerfile`, `docker-compose.yml`) and CI workflows exist across projects, but live cloud runtime endpoints on external hosts remain unverified due to sandbox network boundaries.

---

# Repository Action Matrix

## 1. AGENT-LENS-

### KEEP
- `backend_detectors.py`: Hash-based sliding window loop detection engine.
- `backend_hallucination.py`: Cosine similarity grounding check logic.
- `backend_models.py` & `backend_schemas.py`: SQLAlchemy trace models and Pydantic validation schemas.

### FIX
- **Location**: `README.md` & Repository Structure.
- **Problem**: README refers to a replay dashboard UI, but frontend dashboard components are not present in the repository.
- **Evidence**: `backend_main.py` provides REST endpoints for trace data, but no `frontend/` or React directory exists.
- **Expected Benefit**: Prevents recruiter confusion by clarifying that the repository represents a backend observability REST API.
- **Risk**: Low (Documentation update).

### REMOVE
- None. Repository contains clean Python source files without scaffold residue.

### VERIFY
- Runtime performance and memory footprint of the sliding window hash map when processing high-volume trace streams.

### DON'T TOUCH
- `LoopDetector` action/state hashing logic in `backend_detectors.py`.

### LEARN
- Explain how state hashing in sliding windows detects repetitive agent loops.
- Explain the trade-offs of cosine similarity grounding versus cross-encoder Natural Language Inference (NLI) models.

### FIRST ACTION
- Update `README.md` to state that the repository provides the backend REST API and anomaly detection engine for agent observability.

---

## 2. bhashini-voice-gateway

### KEEP
- `app_action_executor.py`: Risk-scoring engine and Redis confirmation gate.
- `app_routers_voice.py`: Audio upload and Bhashini ASR routing logic.
- `docker-compose.yml`: Multi-container setup for FastAPI and Redis.

### FIX
- **Location**: `app_bhashini_client.py`.
- **Problem**: When `BHASHINI_API_KEY` is missing, the client silently returns mock ASR transcriptions without explicit logging warnings.
- **Evidence**: `app_bhashini_client.py` contains unflagged mock fallback paths.
- **Expected Benefit**: Prevents developers from mistaking mock responses for live Bhashini API calls during local testing.
- **Risk**: Low (Adding log warnings).

### REMOVE
- None. No scaffold residue or transient build artifacts detected.

### VERIFY
- End-to-end ASR transcription latency and intent classification accuracy using live Bhashini API credentials.

### DON'T TOUCH
- Redis confirmation token TTL state machine in `app_action_executor.py`.

### LEARN
- Explain the security architecture of human-in-the-loop confirmation gates for high-risk transactional operations.
- Explain how Bhashini ASR transcripts are parsed into structured intent representations.

### FIRST ACTION
- Add an explicit `logger.warning("Operating in MOCK Bhashini ASR mode")` call in `app_bhashini_client.py` when API keys are unconfigured.

---

## 3. enterprise-ai-investigation

### KEEP
- `AuditTrailStream.tsx`: Renders real-time investigation reasoning steps.
- `EvidenceInspector.tsx`: Provides side-by-side evidence citation viewing.
- `GuardrailsBanner.tsx`: Displays active policy compliance and safety status.

### FIX
- **Location**: `frontend/src/components/AuditTrailStream.tsx`.
- **Problem**: Lack of automatic SSE reconnect handling if the backend stream drops during long investigations.
- **Evidence**: Frontend stream listener assumes an uninterrupted SSE connection.
- **Expected Benefit**: Improves frontend resilience against transient network disconnects.
- **Risk**: Medium (Requires testing EventSource reconnect logic).

### REMOVE
- None. Component hierarchy and TypeScript definitions are clean.

### VERIFY
- Vitest unit test suite execution (`frontend_src_test_AuditTrailStream.test.tsx`, `frontend_src_test_EvidenceInspector.test.tsx`).

### DON'T TOUCH
- `EvidenceInspector.tsx` side-by-side citation UI layout.

### LEARN
- Explain how audit trails are streamed from backend RAG pipelines to React frontend components.
- Explain how source evidence citations are linked to model-generated investigation claims.

### FIRST ACTION
- Add reconnect and error state handling to the SSE consumer hook in `AuditTrailStream.tsx`.

---

## 4. epoxy-distributed-ai-router

### KEEP
- `router_engine.py`: Multi-factor semantic complexity evaluation engine.
- `train_lora_classifier.py`: PEFT LoRA classifier training script.
- `inference_worker.py`: Decoupled RabbitMQ queue consumer.

### FIX
- **Location**: `docs/` directory.
- **Problem**: Latency and cost savings claims in README are not backed by sample benchmark output logs in the repository.
- **Evidence**: `benchmark_router.py` exists, but benchmark output data is not saved in `docs/`.
- **Expected Benefit**: Provides concrete evidence for claims regarding inference latency reduction and cost optimization.
- **Risk**: Low (Adding documentation/CSV assets).

### REMOVE
- None. Checkpoints and transient outputs are properly gitignored.

### VERIFY
- Pytest suite execution (`test_routing_semantics.py`) and RabbitMQ message routing in local environment.

### DON'T TOUCH
- Semantic complexity scoring formula in `router_engine.py`.

### LEARN
- Explain how semantic complexity scoring determines whether to route prompts to a local SLM or cloud LLM.
- Explain how LoRA fine-tuning produces a lightweight sequence classifier head.

### FIRST ACTION
- Run `benchmark_router.py` and commit sample benchmark metrics to `docs/benchmark_results.md`.

---

## 5. hris-import-preview

### KEEP
- `importer_services_parser.py`: Pandas-based CSV/XLSX parser and row validator.
- `importer_forms.py`: File upload validation and mapping configuration.
- `importer_tests.py`: Django test cases for invalid row formatting and required fields.

### FIX
- **Location**: Repository root (`README.md`).
- **Problem**: Repository lacks a `README.md` file explaining setup, usage, and test commands.
- **Evidence**: `ls` shows Django application files but no `README.md`.
- **Expected Benefit**: Allows recruiters and developers to understand repository purpose and run test suites.
- **Risk**: Low (Documentation addition).

### REMOVE
- None. Clean minimal Django backend structure.

### VERIFY
- Test suite execution via `python manage.py test`.

### DON'T TOUCH
- Validation logic in `importer_services_parser.py`.

### LEARN
- Explain dry-run data import validation patterns in enterprise Django applications.
- Explain how Pandas is used to detect missing columns and invalid data types prior to database persistence.

### FIRST ACTION
- Create a `README.md` file detailing prerequisite dependencies, setup instructions, and test commands (`python manage.py test`).

---

## 6. lld-practice-platform-final

### KEEP
- `src_evaluators_DeterministicEvaluator.js`: Structural AST/regex code evaluation service.
- `src_rubric_rubric.js`: Design problem scoring rubric engine.
- `src_routes_attempts.js`: Express REST routing for user attempt submissions.

### FIX
- **Location**: `src/` directory.
- **Problem**: Codebase is written in JavaScript (ES6) rather than TypeScript, lacking static compile-time type safety for domain models.
- **Evidence**: All source files use `.js` extension without TypeScript declaration files.
- **Expected Benefit**: Eliminates runtime type errors across submission payload handlers.
- **Risk**: Medium (Requires refactoring JS files to TS and configuring `tsconfig.json`).

### REMOVE
- None. Standard Node.js backend structure.

### VERIFY
- Jest test suite execution (`tests_deterministicEvaluator.test.js`).

### DON'T TOUCH
- Rubric scoring logic in `src_rubric_rubric.js`.

### LEARN
- Explain how deterministic structural evaluation checks user submission code against required class definitions and interface implementations without executing untrusted code.

### FIRST ACTION
- Add a `tsconfig.json` file and convert `src_evaluators_DeterministicEvaluator.js` to TypeScript.

---

## 7. meridian-market

### KEEP
- `src_app_api_checkout_route.ts`: Stripe Connect split payment implementation.
- `mini-services_realtime_index.ts`: Independent WebSocket real-time inventory service.
- `prisma/schema.prisma`: Multi-vendor relational data model.

### FIX
- **Location**: `package.json` & `.github_workflows_ci.yml`.
- **Problem**: `package.json` lists `"z-ai-web-dev-sdk": "^0.0.18"`, which is not imported or used anywhere in the application source code.
- **Evidence**: Source code inspection confirms standard Stripe SDK and Prisma usage without `z-ai-web-dev-sdk` imports.
- **Expected Benefit**: Removes unneeded dependency and cleans up package manifest.
- **Risk**: Low (Dependency removal).

### REMOVE
- Unused `"z-ai-web-dev-sdk"` entry in `package.json`.

### VERIFY
- Next.js build compilation (`npm run build`) and Stripe Connect webhook event handling.

### DON'T TOUCH
- Split payout platform fee calculation logic in `src_app_api_checkout_route.ts`.

### LEARN
- Explain how Stripe Connect handles multi-vendor split payments and platform fee allocations.
- Explain how the WebSocket inventory service locks product stock during checkout.

### FIRST ACTION
- Remove `"z-ai-web-dev-sdk"` from `package.json` and regenerate lockfile.

---

## 8. OWNARA-AI

### KEEP
- `src_app_api_approvals_[id]_route.ts`: Human-in-the-loop approval state machine.
- `src_app_api_capabilities_route.ts`: Agent capability boundary enforcement API.
- `prisma/schema.prisma`: Schema for `Agent`, `Capability`, `ApprovalRequest`, and `AuditLog`.

### FIX
- **Location**: `docs/` or API layer.
- **Problem**: Lacks OpenAPI/Swagger documentation for capability and approval REST endpoints.
- **Evidence**: API routes exist in Next.js App Router, but no OpenAPI specification file is published.
- **Expected Benefit**: Facilitates enterprise integration of governance API routes.
- **Risk**: Low (Documentation/spec addition).

### REMOVE
- None. Clean Next.js + Prisma TypeScript codebase.

### VERIFY
- API route integration tests for capability bounds checking.

### DON'T TOUCH
- Approval request state transition logic in `src_app_api_approvals_[id]_route.ts`.

### LEARN
- Explain the architecture of agent capability boundaries and human approval gates for autonomous tasks.
- Explain the data model required for immutable audit log tracking in enterprise AI governance systems.

### FIRST ACTION
- Add OpenAPI annotations or an `openapi.json` spec file documenting `/api/capabilities` and `/api/approvals`.

---

## 9. Real-Time-Demand-Risk-Intelligence-Engine

### KEEP
- `src_analytics_inventory_health.py`: Mathematical formulation for safety stock $SS = Z \times \sigma_d \times \sqrt{L}$ and lead time risk scoring.
- `src_api_routes.py`: FastAPI routes for inventory metrics.
- `src_data_generator.py`: Time-series demand generation utility.

### FIX
- **Location**: `src_api_routes.py`.
- **Problem**: Lacks an API endpoint to trigger model retraining when new time-series CSV data is uploaded.
- **Evidence**: `src_api_routes.py` exposes read endpoints for inventory health, but no POST endpoint for re-fitting forecasting models.
- **Expected Benefit**: Enables dynamic model updates upon data ingestion.
- **Risk**: Medium (Adding route and background task handler).

### REMOVE
- None. Clean Python analytics project.

### VERIFY
- Pytest suite execution (`tests/`) verifying mathematical safety stock calculations.

### DON'T TOUCH
- Mathematical formulas in `src_analytics_inventory_health.py`.

### LEARN
- Explain the operations research formulas for safety stock and lead time variance risk indexing.
- Explain how statistical time-series forecasting informs inventory reorder points.

### FIRST ACTION
- Add a `/api/v1/retrain` POST route in `src_api_routes.py` to trigger model updates.

---

## 10. repo-pilot

### KEEP
- `backend_app_services_ingestion_scanner.py`: Python AST codebase parser and symbol call-graph generator.
- `backend_app_services_indexing_sqlite_fts.py`: SQLite BM25 full-text indexing engine.
- `backend_app_api_router_rag.py`: RAG query endpoint attaching code context snippets.

### FIX
- **Location**: `backend_app_services_ingestion_scanner.py`.
- **Problem**: Scanner supports parsing Python files via the `ast` module, but lacks parsers for JavaScript/TypeScript source files.
- **Evidence**: `scanner.py` imports Python's built-in `ast` package and filters for `.py` files.
- **Expected Benefit**: Expands repository scanning capabilities to multi-language codebases.
- **Risk**: Medium (Requires integrating Tree-sitter or JS/TS AST parser).

### REMOVE
- None. Modular FastAPI + SQLite architecture.

### VERIFY
- Pytest benchmark suite in `backend_app_evaluation_dataset.py`.

### DON'T TOUCH
- SQLite FTS5 BM25 search queries in `backend_app_services_indexing_sqlite_fts.py`.

### LEARN
- Explain how AST parsing extracts symbols, function definitions, and call-graphs from source repositories.
- Explain the advantages of hybrid retrieval combining SQLite BM25 text search with vector embeddings.

### FIRST ACTION
- Integrate Tree-sitter in `scanner.py` to enable AST symbol extraction for `.js` and `.ts` files.

---

## 11. rishav-portfolio-starter

### KEEP
- `src_components_library_topology-glyph.tsx`: Interactive SVG vector canvas graphic.
- `src_app_page.tsx`: Single-page portfolio assembly.
- `src_components_sections_practice.tsx`: Project gallery section.

### FIX
- **Location**: `package.json`.
- **Problem**: `package.json` includes `"z-ai-web-dev-sdk": "^0.0.18"`, which is not imported or used anywhere in the portfolio frontend.
- **Evidence**: Source code scan shows zero references to `z-ai-web-dev-sdk` across components.
- **Expected Benefit**: Removes unneeded dependency from manifest.
- **Risk**: Low (Dependency removal).

### REMOVE
- Unused `"z-ai-web-dev-sdk"` entry in `package.json`.

### VERIFY
- Static site export (`npm run build`).

### DON'T TOUCH
- SVG animation logic in `src_components_library_topology-glyph.tsx`.

### LEARN
- Explain responsive layout design, Framer Motion transitions, and interactive SVG canvas rendering in Next.js.

### FIRST ACTION
- Remove `"z-ai-web-dev-sdk"` from `package.json`.

---

## 12. rishav579

### KEEP
- `README.md`: Central profile landing document, project matrix, Shields.io badges, and social links.

### FIX
- **Location**: `README.md`.
- **Problem**: Project links and descriptions should be periodically verified to ensure alignment as underlying repositories evolve.
- **Evidence**: Manual verification confirms current links match active public repositories.
- **Expected Benefit**: Maintains accurate recruiter navigation across portfolio projects.
- **Risk**: Low (Documentation maintenance).

### REMOVE
- None. Minimal, clean profile repository.

### VERIFY
- Link target validity across all featured project badges.

### DON'T TOUCH
- Profile layout structure and positioning statements.

### LEARN
- Articulate the technical scope and architectural trade-offs of all featured portfolio projects.

### FIRST ACTION
- Perform periodic routine check of all repository links in `README.md`.

---

## 13. sahayak

### KEEP
- `backend_app_services_ai_service.py`: Colloquial Hinglish NLP extraction engine.
- `backend_app_db_mongo.py`: Motor async MongoDB client wrapper.
- `backend_app_core_security.py`: Password hashing (bcrypt) and JWT authentication.

### FIX
- **Location**: `tests/`.
- **Problem**: Lack of unit tests for colloquial Hinglish date expression parsing (e.g. "kal shaam 5 baje", "parso dopahar").
- **Evidence**: Existing test suite checks standard REST routes but lacks edge-case NLP date parser tests.
- **Expected Benefit**: Verifies parser accuracy against colloquial regional date phrases.
- **Risk**: Low (Adding test cases).

### REMOVE
- None. Async Python backend layout.

### VERIFY
- Pytest execution and MongoDB collection creation via `.github_workflows_ci.yml`.

### DON'T TOUCH
- Motor async database connection methods in `backend_app_db_mongo.py`.

### LEARN
- Explain how NLP prompts and regex rules extract structured meeting action items from mixed Hinglish text.
- Explain the advantages of non-blocking Motor async drivers for MongoDB in FastAPI services.

### FIRST ACTION
- Add unit tests in `tests/test_ai_service.py` specifically targeting colloquial Hinglish date parsing expressions.

---

## 14. secure-enterprise-rag

### KEEP
- `backend_alembic_versions_003_create_documents_and_chunks.py`: PostgreSQL `pgvector` HNSW index with tenant metadata.
- `backend_app_api_v1_auth.py`: JWT authentication embedding tenant ID and role attributes.
- `backend_app_core_rate_limit.py`: IP and user ID rate limiting middleware.

### FIX
- **Location**: PII Redaction Module.
- **Problem**: PII sanitizer uses basic regex and Presidio defaults, which may miss custom enterprise identifiers (e.g. employee IDs, internal project codes).
- **Evidence**: Source inspection shows standard Presidio recognizers without custom enterprise regex rules.
- **Expected Benefit**: Enhances PII redaction coverage prior to sending prompts to external LLM providers.
- **Risk**: Low (Adding custom PII recognizer patterns).

### REMOVE
- None. Enterprise Python layout with full Alembic migration history.

### VERIFY
- Pytest security suite execution validating multi-tenant chunk isolation.

### DON'T TOUCH
- Pre-retrieval SQL `WHERE tenant_id = :user_tenant` clause in vector search queries.

### LEARN
- Explain why pre-retrieval SQL metadata filtering is essential to prevent cross-tenant vector chunk leakage in enterprise RAG.
- Explain the implementation of rate limiting and PII redaction middleware in secure LLM pipelines.

### FIRST ACTION
- Register custom enterprise identifier recognizers in the PII sanitization module.

---

## 15. self-learning--ai-agent

### KEEP
- `src/lib/agent/orchestrator.ts`: 9-stage self-improving execution loop.
- `src/lib/agent/tools/code-executor.ts`: Hardened `node:vm` sandbox with null-prototype context and 2s execution timeout.
- `src/lib/agent/memory/retrieval.ts`: TF-IDF similarity scoring with query enrichment and trust weighting.
- `src/lib/llm.ts`: Functional LLM provider wrapper consuming `z-ai-web-dev-sdk`.

### FIX
- **Location**: `scripts/reset-db.ts`, `scripts/audit-db-verify.ts`, `scripts/audit-evidence-verify.ts`, `scripts/perf-stats.ts`, `.zscripts/`, and `package.json`.
- **Problem**: Script files and production start scripts use hardcoded fallback path strings (`file:/home/z/my-project/db/custom.db`).
- **Evidence**: `grep` shows multiple script files setting `DATABASE_URL` fallback to `/home/z/my-project/db/custom.db`.
- **Expected Benefit**: Ensures database connection scripts resolve correctly across different developer environments using relative defaults (`file:./db/custom.db`).
- **Risk**: Medium (Requires verifying script execution paths across test and production environments).

### REMOVE
- Unused `z-cdn` / `ChatGLM` icon metadata URL in `src/app/layout.tsx` (`https://z-cdn.chatglm.cn/z-ai/static/logo.svg`).

### VERIFY
- Local test execution via `bun test` (**175 / 175 tests pass**), typechecking (`bunx tsc --noEmit`), and standalone build (`bun run build`).

### DON'T TOUCH
- Null-prototype context construction in `src/lib/agent/tools/code-executor.ts`.
- `z-ai-web-dev-sdk` import in `src/lib/llm.ts` (Required for LLM API functionality).

### LEARN
- Explain the 9-stage self-improving agent loop: `Understand -> Retrieve -> Select Strategy -> Plan -> Execute -> Evaluate -> Reflect -> Store`.
- Explain how `node:vm` sandbox context is hardened against constructor escapes and host prototype pollution.

### FIRST ACTION
- Replace `/home/z/my-project/db/custom.db` fallback path strings in `scripts/` with `process.env.DATABASE_URL || 'file:./db/custom.db'`.
