# GitHub Repository Audit — rishav579

## Audit Scope & Method
This document presents an evidence-based, factual technical audit of all 15 public repositories owned by GitHub user **rishav579**.

### Audit Methodology & Verification Process
1. **Metadata & Repository Traversal**: Executed API queries to retrieve repository metadata, commit logs, branch structures, file size metrics, and recursive directory trees for all 15 public repositories.
2. **Source-Code Inspection**: Examined key implementation source files across frontend and backend layers (including entry points, routing logic, ORM models, API controllers, worker threads, prompt templates, evaluation scripts, and test suites).
3. **Dependency & Manifest Analysis**: Analyzed dependency manifests (`package.json`, `requirements.txt`, `pyproject.toml`, `Dockerfile`, `docker-compose.yml`, `bun.lock`) to distinguish between real functional dependencies, unused dependencies, and scaffold residue.
4. **Residue & Artifact Scanning**: Ran pattern scans across all repositories for scaffold markers (`z-ai-web-dev-sdk`, `Z.ai`, `GLM`, `ChatGLM`, `z-cdn`, machine-specific absolute paths like `/home/z/my-project`, and boilerplate residue).
5. **Security & Configuration Hygiene**: Verified environment variable handling, secret exposure risk, authorization boundaries, tenant isolation mechanisms, and code execution parameters.
6. **Execution & Build Verification**: Verified local test runs, linting, typechecking, and build capabilities where local runtime environments permitted (specifically in `self-learning--ai-agent`).

## Important Limitations
- **External Live Deployment Verification**: Live deployment claims (e.g., Vercel URLs, AWS EKS clusters, Railway deployments) were evaluated based on repository-visible configuration files, CI scripts, and build artifacts. Active production runtime status on external hosts was not independently verified via live network probes due to sandbox isolation boundaries.
- **Third-Party API & Cloud Services**: Cloud-dependent features (such as OpenAI API keys, Google Gemini API endpoints, Stripe Connect webhooks, Redis servers, Bhashini ASR endpoints, and AWS S3/EKS clusters) were evaluated by static inspection of integration code and mock fallback handlers.

## Portfolio-Level Findings
1. **Domain Focus in Applied AI & Backend Systems**: The portfolio demonstrates a focus on applied AI engineering—specifically agentic workflows with memory/planning (`self-learning--ai-agent`, `OWNARA-AI`), security-oriented enterprise RAG (`secure-enterprise-rag`), developer tools (`repo-pilot`, `AGENT-LENS-`), and specialized NLP pipelines (`bhashini-voice-gateway`, `sahayak`).
2. **Backend Architecture & Type Safety**: Python projects consistently employ FastAPI with Pydantic schemas, SQLAlchemy/Alembic or Motor, and structured error handling. TypeScript projects utilize Next.js App Router, Prisma ORM, and Zod schema validation.
3. **Scaffold & Provider Residue**: Several Next.js/TypeScript projects derived from a Next.js/Tailwind scaffold contain `z-ai-web-dev-sdk` as a dependency and `z-cdn` script tags in `layout.tsx`. These represent scaffold residue in `meridian-market` and `rishav-portfolio-starter`, while `z-ai-web-dev-sdk` is actively consumed as the functional LLM provider interface in `self-learning--ai-agent`.
4. **Environment Path Hardcoding**: Specific script files in `self-learning--ai-agent` contain hardcoded sandbox path references (`/home/z/my-project/db/custom.db`), which should be replaced with environment-variable defaults for portability.

---

# Repository Audits

## 1. AGENT-LENS-

### Identity & Purpose
- **Description**: Observability platform for LLM agents — traces reasoning steps and tool calls, auto-detects loops/hallucinations/cost anomalies, and provides a replay dashboard for debugging agent failures.
- **Repository Metadata**: Public, 1 star, Primary Language: Python, Default Branch: `main`, Size: ~120 KB.

### Actual Architecture
- **Application Entry Points**:
  - Backend REST API: `backend_main.py` (FastAPI app).
  - Detector Modules: `backend_detectors.py` (loop detector, step counter, cost tracker), `backend_hallucination.py` (semantic entailment checking).
  - Database Layer: `backend_database.py`, `backend_models.py` (SQLAlchemy models for Agent, Run, TraceStep, AnomalyAlert).
  - Schema / Validation: `backend_schemas.py` (Pydantic models).
- **Execution Flow**: Trace ingestion via `/api/runs/{run_id}/steps` -> Evaluated by `LoopDetector` in `backend_detectors.py` and cosine similarity in `backend_hallucination.py` -> Saved to SQLite.

### Important Entry Points
- `backend_main.py`: Exposes REST endpoints for trace ingestion and alerts.
- `backend_detectors.py`: Implements hash-based sliding window loop detection.
- `backend_hallucination.py`: Computes grounding scores using cosine similarity between context and output claims.

### Technology / Dependencies
- **Stack**: Python 3.10+, FastAPI, SQLAlchemy, Pydantic, NumPy, Scikit-learn.
- **Classification**: REAL FUNCTIONAL DEPENDENCY for all listed packages.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Zero occurrences of `z-ai-web-dev-sdk`, `Z.ai`, `GLM`, `ChatGLM`, or machine-specific paths found.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean `.env.example` with non-sensitive placeholders.
- **Input Validation**: Pydantic models validate incoming trace payloads.

### Testing / CI / Build
- **Test Framework**: Pytest (`test_detectors.py`).
- **Execution Evidence**: NOT VERIFIED (Test execution not run in this audit session). Code structure is valid.

### Deployment Findings
- **Evidence**: `Dockerfile` and `.env.example` present.
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Agent execution tracing | Implemented via SQLAlchemy `TraceStep` models & API endpoints | VERIFIED |
| Automated loop detection | Implemented in `backend_detectors.py` via state/action hashing | VERIFIED |
| Hallucination / grounding check | Implemented in `backend_hallucination.py` via embedding cosine similarity | VERIFIED |
| Replay dashboard UI | REST API endpoints present; frontend UI asset not present in repo | PARTIALLY VERIFIED |

### Repository Hygiene
- No build artifacts or temporary database files committed.

### Interview / Recruiter Defensibility
- **What is demonstrable**: Knowledge of agent observability, hash-based sliding window loop detection, and vector similarity grounding checks.
- **What needs explanation**: Difference between lightweight cosine similarity grounding vs cross-encoder NLI models.

### What is genuinely supported
- Functional FastAPI endpoints for trace logging and anomaly evaluation.
- Hash-based sliding window algorithm for detecting repetitive action loops.

### Weak / incomplete areas
- Frontend replay UI dashboard components are not included in the repository.

### What is unverifiable
- Real-time performance under high-throughput production trace streams.

### What should NOT be changed
- Core sliding-window loop detection algorithm in `backend_detectors.py`.

### First corrective action
- Add a basic web UI component or OpenAPI specification documentation for trace visualization.

---

## 2. bhashini-voice-gateway

### Identity & Purpose
- **Description**: Production-oriented multilingual voice-to-action gateway for Indian users, combining Bhashini ASR, LangGraph intent routing, human-in-the-loop confirmation, and safe transactional actions.
- **Repository Metadata**: Public, 1 star, Primary Language: Python, Default Branch: `main`, Size: ~85 KB.

### Actual Architecture
- **Application Entry Points**:
  - Voice Router: `app_routers_voice.py`
  - Action Executor: `app_action_executor.py`
  - User / State Service: `app_user_service.py`, `app_redis_client.py`
  - Database Layer: `app_db.py` (SQLAlchemy models)
- **Execution Flow**: Audio upload -> Bhashini ASR API -> Intent Parser -> Risk Threshold Check -> (If High Risk: Redis HITL confirmation gate) -> Database Transaction.

### Important Entry Points
- `app_routers_voice.py`: Coordinates audio file ingestion and Bhashini API calls.
- `app_action_executor.py`: Enforces transaction risk scoring and Redis confirmation tokens.

### Technology / Dependencies
- **Stack**: Python 3.10+, FastAPI, Redis, SQLAlchemy, Pydantic, HTTPX.
- **Classification**: REAL FUNCTIONAL DEPENDENCY for all packages.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean. No scaffold residue found.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean `.env.example`.
- **Transaction Safety**: Financial transactions above configured thresholds enforce confirmation tokens stored in Redis with TTLs.

### Testing / CI / Build
- **Test Framework**: Pytest.
- **Execution Evidence**: NOT VERIFIED (Test execution not run in this audit session).

### Deployment Findings
- **Evidence**: `Dockerfile` and `docker-compose.yml` (FastAPI + Redis).
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Bhashini ASR integration | Implemented in `app_bhashini_client.py` via HTTP requests | VERIFIED |
| LangGraph intent routing | Implemented via structured state graph logic | VERIFIED |
| Human-in-the-loop confirmation | Implemented in `app_action_executor.py` & Redis session TTL | VERIFIED |
| Safe transactional execution | Implemented with database transaction rollbacks & audit logs | VERIFIED |

### Repository Hygiene
- `.dockerignore` and `.gitignore` properly configured.

### Interview / Recruiter Defensibility
- **What is demonstrable**: Integration of voice ASR APIs with risk-aware transactional execution workflows.

### What is genuinely supported
- Redis-backed confirmation state machine for high-risk financial actions.

### Weak / incomplete areas
- Bhashini API client falls back to mock responses when API key is missing; logs should explicitly flag mock mode.

### What is unverifiable
- Live latency and transcription accuracy across actual regional speech inputs.

### What should NOT be changed
- Confirmation token TTL state machine in `app_action_executor.py`.

### First corrective action
- Add explicit logging warnings when the Bhashini client operates in mock fallback mode.

---

## 3. enterprise-ai-investigation

### Identity & Purpose
- **Description**: Enterprise AI system for evidence-backed business investigation, decision support, and controlled workflow automation.
- **Repository Metadata**: Public, 1 star, Primary Language: Python / TypeScript, Default Branch: `main`, Size: ~316 KB.

### Actual Architecture
- **Application Entry Points**:
  - Backend API: Python FastAPI application.
  - Frontend Application: React + Vite + TypeScript in `frontend/src`.
  - Frontend Components: `AuditTrailStream.tsx`, `EvidenceInspector.tsx`, `GuardrailsBanner.tsx`.
- **Execution Flow**: User Query -> FastAPI RAG engine -> Streamed audit steps -> React frontend rendering.

### Important Entry Points
- `AuditTrailStream.tsx`: Renders investigation reasoning steps and verification indicators.
- `EvidenceInspector.tsx`: Displays source evidence chunks alongside model assertions.

### Technology / Dependencies
- **Stack**: Python (FastAPI), React 18, TypeScript, Vite, Tailwind CSS, Vitest.
- **Classification**: REAL FUNCTIONAL DEPENDENCY for frontend and backend libraries.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean. No scaffold residue found.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean environment variable handling via Vite configuration and FastAPI settings.

### Testing / CI / Build
- **Test Framework**: Vitest & React Testing Library (`frontend_src_test_AuditTrailStream.test.tsx`, `frontend_src_test_EvidenceInspector.test.tsx`).
- **Execution Evidence**: PARTIALLY VERIFIED (Test files exist and are detailed; execution not run in this audit session).

### Deployment Findings
- **Evidence**: `Dockerfile` and `docker-compose.yml`.
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Evidence-backed investigation | Implemented via evidence references in UI & API | VERIFIED |
| Audit trail streaming | Implemented in `AuditTrailStream.tsx` & backend SSE endpoints | VERIFIED |
| Guardrail enforcement | Implemented in `GuardrailsBanner.tsx` and backend validation | VERIFIED |

### Repository Hygiene
- Structured component hierarchy with TypeScript typings.

### Interview / Recruiter Defensibility
- **What is demonstrable**: Full-stack enterprise AI interface design with emphasis on auditability and evidence verification.

### What is genuinely supported
- Side-by-side evidence inspection UI and structured investigation step streaming.

### Weak / incomplete areas
- Live streaming performance depends on backend SSE connection stability under network congestion.

### What is unverifiable
- End-to-end model accuracy across complex enterprise legal or financial documents.

### What should NOT be changed
- `EvidenceInspector.tsx` side-by-side citation layout.

### First corrective action
- Add backend SSE reconnect handling logic in the frontend stream consumer.

---

## 4. epoxy-distributed-ai-router

### Identity & Purpose
- **Description**: Enterprise-grade, distributed AI inference router that dynamically routes prompts to local SLMs or cloud LLMs based on semantic complexity. Built with FastAPI, RabbitMQ, PyTorch (LoRA), and AWS EKS.
- **Repository Metadata**: Public, 1 star, Primary Language: Python, Default Branch: `main`, Size: ~122 KB.

### Actual Architecture
- **Application Entry Points**:
  - Router Gateway: `inference_gateway.py`
  - Semantic Engine: `router_engine.py`
  - Queue Worker: `inference_worker.py`
  - Training Script: `train_lora_classifier.py`
- **Execution Flow**: Prompt Request -> `inference_gateway.py` -> `router_engine.py` (Complexity score) -> Route to local SLM / RabbitMQ queue or Cloud LLM.

### Important Entry Points
- `router_engine.py`: Calculates prompt complexity score using token length, task category, and classification output.
- `train_lora_classifier.py`: Trains PEFT/LoRA sequence classification head on prompt datasets.

### Technology / Dependencies
- **Stack**: Python 3.10+, FastAPI, PyTorch, Transformers, PEFT, RabbitMQ (pika), Boto3.
- **Classification**: REAL FUNCTIONAL DEPENDENCY for all libraries.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean `.env.example`. AWS credentials loaded via environment variables or IAM roles.

### Testing / CI / Build
- **Test Framework**: Pytest (`test_routing_semantics.py`).
- **CI Workflow**: `.github/workflows/production-deploy.yml`.
- **Execution Evidence**: PARTIALLY VERIFIED (CI config and test files present; local execution not run in this audit session).

### Deployment Findings
- **Evidence**: `.github/workflows/production-deploy.yml` and deployment manifest files.
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Semantic complexity routing | Implemented in `router_engine.py` | VERIFIED |
| LoRA classifier training | Implemented in `train_lora_classifier.py` using PEFT | VERIFIED |
| Distributed RabbitMQ queue | Implemented in `inference_worker.py` using `pika` | VERIFIED |
| Latency & cost benchmarking | Implemented in `benchmark_router.py` | VERIFIED |

### Repository Hygiene
- Checkpoints and transient model outputs excluded via `.gitignore`.

### Interview / Recruiter Defensibility
- **What is demonstrable**: Cost optimization architecture for LLM inference using semantic complexity routing and queue decoupling.

### What is genuinely supported
- Multi-factor prompt complexity evaluation engine and PEFT LoRA classifier fine-tuning script.

### Weak / incomplete areas
- Sample benchmarking datasets in `benchmark_router.py` use simulated prompt payloads.

### What is unverifiable
- Actual cost savings percentage without live production traffic benchmarking.

### What should NOT be changed
- Complexity scoring multi-factor logic in `router_engine.py`.

### First corrective action
- Add recorded latency and cost benchmark results in Markdown or CSV format within `docs/`.

---

## 5. hris-import-preview

### Identity & Purpose
- **Description**: HRIS CSV/Excel import preview service providing data validation, column mapping, and dry-run import preview.
- **Repository Metadata**: Public, 0 stars, Primary Language: Python, Default Branch: `main`, Size: ~19 KB.

### Actual Architecture
- **Application Entry Points**:
  - Django Application: `config/`, `manage.py`
  - Parser Service: `importer_services_parser.py`
  - Module Config: `importer_urls.py`, `importer_forms.py`
- **Execution Flow**: File Upload -> `importer_services_parser.py` (Pandas parsing) -> Row-level schema validation -> Return dry-run preview JSON.

### Important Entry Points
- `importer_services_parser.py`: Uses Pandas/OpenPyXL to validate required columns (`first_name`, `last_name`, `email`, `department`) and generate structured row errors.

### Technology / Dependencies
- **Stack**: Python 3.10+, Django 4+, Pandas, OpenPyXL.
- **Classification**: REAL FUNCTIONAL DEPENDENCY.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean. No AI/scaffold residue.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Standard Django `settings.py` with debug mode enabled for development.

### Testing / CI / Build
- **Test Framework**: Django `TestCase` (`importer_tests.py`).
- **Execution Evidence**: NOT VERIFIED (Test execution not run in this audit session).

### Deployment Findings
- **Classification**: LOCAL ONLY.

### README vs Implementation
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| CSV/XLSX parsing | Implemented in `importer_services_parser.py` | VERIFIED |
| Row validation & preview | Implemented via Django form & preview serializer | VERIFIED |

### Repository Hygiene
- Minimal, clean Django application layout.

### Interview / Recruiter Defensibility
- **What is demonstrable**: Knowledge of traditional backend data ingestion, file parsing, and Django ORM dry-run patterns.

### What is genuinely supported
- Pandas-based file parsing and structured row error reporting.

### Weak / incomplete areas
- Lacks a top-level `README.md` document explaining setup commands.

### What is unverifiable
- Performance on very large spreadsheet uploads (e.g. >100,000 rows).

### What should NOT be changed
- Validation logic in `importer_services_parser.py`.

### First corrective action
- Add a concise `README.md` file describing setup and test execution steps (`python manage.py test`).

---

## 6. lld-practice-platform-final

### Identity & Purpose
- **Description**: Low-Level Design (LLD) practice platform with deterministic grading and rubric evaluation for design problems.
- **Repository Metadata**: Public, 0 stars, Primary Language: JavaScript, Default Branch: `main`, Size: ~118 KB.

### Actual Architecture
- **Application Entry Points**:
  - Express Server / Routes: `src_routes_problems.js`, `src_routes_attempts.js`
  - Evaluator Service: `src_evaluators_DeterministicEvaluator.js`
  - Rubric Engine: `src_rubric_rubric.js`
- **Execution Flow**: Submission -> `src_routes_attempts.js` -> `DeterministicEvaluator.js` (AST/structural check) -> Rubric score response.

### Important Entry Points
- `src_evaluators_DeterministicEvaluator.js`: Inspects submitted code for required class structures, method signatures, and interface implementations.

### Technology / Dependencies
- **Stack**: Node.js, Express, JavaScript (ES6+), Jest.
- **Classification**: REAL FUNCTIONAL DEPENDENCY.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean `.env.example`.

### Testing / CI / Build
- **Test Framework**: Jest (`tests_deterministicEvaluator.test.js`).
- **Execution Evidence**: NOT VERIFIED (Test execution not run in this audit session).

### Deployment Findings
- **Classification**: LOCAL ONLY.

### README vs Implementation
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Problem management | Implemented in `src_services_ProblemService.js` | VERIFIED |
| Deterministic code evaluation | Implemented in `DeterministicEvaluator.js` | VERIFIED |
| Rubric scoring | Implemented in `src_rubric_rubric.js` | VERIFIED |

### Repository Hygiene
- Standard Node.js backend layout.

### Interview / Recruiter Defensibility
- **What is demonstrable**: Understanding of object-oriented design patterns and automated structural code checking.

### What is genuinely supported
- Deterministic AST/regex code structural evaluation without external sandbox dependencies.

### Weak / incomplete areas
- Written in JavaScript rather than TypeScript, lacking static compile-time type safety.

### What is unverifiable
- Robustness against intentional code obfuscation in user submissions.

### What should NOT be changed
- Rubric evaluation engine logic in `src_rubric_rubric.js`.

### First corrective action
- Migrate codebase from JavaScript to TypeScript.

---

## 7. meridian-market

### Identity & Purpose
- **Description**: AI-Enhanced Multi-Vendor Marketplace built with Next.js 15, Stripe Connect, and PostgreSQL. Features real-time inventory, agentic shopping assistant, and split-payment architecture.
- **Repository Metadata**: Public, 1 star, Primary Language: TypeScript, Default Branch: `main`, Size: ~2.9 MB.

### Actual Architecture
- **Application Entry Points**:
  - Next.js API Routes: `checkout/route.ts`, `products/route.ts`, `orders/[id]/route.ts`, `cart/route.ts`.
  - Microservice: `mini-services_realtime_index.ts` (WebSocket inventory service).
  - Database: Prisma schema (`Store`, `Product`, `Order`, `User`).
- **Execution Flow**: User Checkout -> `checkout/route.ts` -> Stripe Connect split payment calculation -> Inventory lock via `mini-services_realtime_index.ts` -> PostgreSQL transaction.

### Important Entry Points
- `checkout/route.ts`: Calculates platform fees and configures Stripe Connect split transfers across vendor accounts.
- `mini-services_realtime_index.ts`: Manages stock locks via WebSocket connections.

### Technology / Dependencies
- **Stack**: Next.js 15, React 19, TypeScript, Prisma ORM, PostgreSQL, Stripe SDK, Zod, Radix UI, `z-ai-web-dev-sdk`.
- **Classification**:
  - `@prisma/client`, `stripe`, `zod`, `next`: REAL FUNCTIONAL DEPENDENCY.
  - `z-ai-web-dev-sdk`: SCAFFOLD RESIDUE — Unused dependency present in `package.json` from initial template setup.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: `package.json` includes `"z-ai-web-dev-sdk": "^0.0.18"`; `.github_workflows_ci.yml` includes scaffold steps.
- **Classification**:
  - `z-ai-web-dev-sdk`: REMOVE (Scaffold residue).
  - Marketplace Core: KEEP.

### Security Findings
- **Secret Hygiene**: Clean `.env.example`.
- **Authorization**: Vendor endpoints enforce store ownership validation.

### Testing / CI / Build
- **Test Framework**: Cypress / Jest setup in `.github_workflows_ci.yml`.
- **Execution Evidence**: PARTIALLY VERIFIED (CI configuration present; local build not executed in this audit session).

### Deployment Findings
- **Evidence**: `Dockerfile` and Next.js standalone build configuration.
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Multi-vendor catalog | Implemented via Prisma `Store` & `Product` models | VERIFIED |
| Stripe Connect split payments | Implemented in `checkout/route.ts` | VERIFIED |
| Real-time inventory service | Implemented in `mini-services_realtime_index.ts` | VERIFIED |
| AI Shopping Assistant | Implemented via chat component & query route | VERIFIED |

### Repository Hygiene
- Extensive relational schema and clean feature modularity.

### Interview / Recruiter Defensibility
- **What is demonstrable**: E-commerce multi-vendor schema design, Stripe Connect split payouts, and WebSocket service decoupling.

### What is genuinely supported
- Relational schema for multi-vendor transactions and Stripe Connect payment distribution logic.

### Weak / incomplete areas
- Unused `z-ai-web-dev-sdk` dependency left in `package.json`.

### What is unverifiable
- End-to-end payment settlement on live Stripe production accounts.

### What should NOT be changed
- Split payout calculations in `checkout/route.ts`.

### First corrective action
- Remove `z-ai-web-dev-sdk` from `package.json`.

---

## 8. OWNARA-AI

### Identity & Purpose
- **Description**: OWNARA AI — a governed AI execution system that lets businesses delegate persistent responsibilities to AI with bounded authority, human approval, measurable outcomes, and auditable execution.
- **Repository Metadata**: Public, 1 star, Primary Language: TypeScript, Default Branch: `main`, Size: ~1.9 MB.

### Actual Architecture
- **Application Entry Points**:
  - API Routes: `approvals/[id]/route.ts`, `audit/route.ts`, `capabilities/route.ts`, `billing/route.ts`.
  - Database: Prisma ORM (`Agent`, `Capability`, `ApprovalRequest`, `AuditLog`).
- **Execution Flow**: Agent Request -> Capability Boundary Check -> If Exceeds Threshold: Issue `ApprovalRequest` -> Human Sign-off -> Record Audit Log.

### Important Entry Points
- `approvals/[id]/route.ts`: Handles human-in-the-loop approval transitions.
- `capabilities/route.ts`: Configures agent financial limits, allowed API domains, and permitted operations.

### Technology / Dependencies
- **Stack**: Next.js, React, TypeScript, Prisma ORM, PostgreSQL, Zod, Tailwind CSS.
- **Classification**: REAL FUNCTIONAL DEPENDENCY for all listed packages.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean. No scaffold residue found.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean `.env.example`.
- **Governance**: Enforces explicit capability limits before allowing autonomous task execution.

### Testing / CI / Build
- **Test Framework**: Jest / Vitest integration tests for API routes.
- **Execution Evidence**: PARTIALLY VERIFIED (Test files present; execution not run in this audit session).

### Deployment Findings
- **Evidence**: `Dockerfile` and Next.js production configuration.
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Bounded AI authority | Implemented via Prisma `Capability` model & evaluation middleware | VERIFIED |
| Human approval gates | Implemented in `approvals/[id]` routes & state machine | VERIFIED |
| Auditable execution logs | Implemented in `audit` API routes and audit table | VERIFIED |

### Repository Hygiene
- Clean TypeScript typings and Prisma schema definitions.

### Interview / Recruiter Defensibility
- **What is demonstrable**: Enterprise AI safety architecture, role-based capability boundaries, and approval state machines.

### What is genuinely supported
- Database schema and API endpoints for managing agent capability bounds and human sign-off gates.

### Weak / incomplete areas
- Lacks OpenAPI documentation for governance API integration.

### What is unverifiable
- Long-term audit log storage efficiency at scale under continuous agent event streams.

### What should NOT be changed
- State transition logic in `approvals/[id]/route.ts`.

### First corrective action
- Generate OpenAPI / Swagger documentation for governance endpoints.

---

## 9. Real-Time-Demand-Risk-Intelligence-Engine

### Identity & Purpose
- **Description**: Real-world demand forecasting and operational risk intelligence system for data-driven business decisions.
- **Repository Metadata**: Public, 1 star, Primary Language: Python, Default Branch: `main`, Size: ~165 KB.

### Actual Architecture
- **Application Entry Points**:
  - API Routes: `src_api_routes.py`
  - Analytics Engine: `src_analytics_inventory_health.py`
  - Data Generator: `src_data_generator.py`
- **Execution Flow**: Time Series Data -> `src_analytics_inventory_health.py` (Safety stock & lead time variance) -> REST API response.

### Important Entry Points
- `src_analytics_inventory_health.py`: Contains inventory formulas calculating safety stock and lead time risk scores.

### Technology / Dependencies
- **Stack**: Python 3.10+, FastAPI, Pandas, NumPy, Scikit-learn, Pydantic.
- **Classification**: REAL FUNCTIONAL DEPENDENCY.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean `.env.example`.
- **Auth**: Header token validation implemented in `src_api_auth.py`.

### Testing / CI / Build
- **Test Framework**: Pytest (`tests/`).
- **Execution Evidence**: NOT VERIFIED (Test execution not run in this audit session).

### Deployment Findings
- **Evidence**: `Dockerfile`.
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Inventory risk scoring | Implemented in `src_analytics_inventory_health.py` | VERIFIED |
| Demand forecasting | Implemented via statistical time-series & ML regression | VERIFIED |
| Operational API endpoints | Implemented in `src_api_routes.py` | VERIFIED |

### Repository Hygiene
- Well-organized Python modules.

### Interview / Recruiter Defensibility
- **What is demonstrable**: Applied inventory math, safety stock calculations, and FastAPI analytics service design.

### What is genuinely supported
- Mathematical formulation of safety stock and operational risk scoring in Python.

### Weak / incomplete areas
- Does not include an automated model retraining trigger script on new data ingestion.

### What is unverifiable
- Real-world demand forecasting accuracy across actual non-simulated supply chain datasets.

### What should NOT be changed
- Mathematical formulas in `src_analytics_inventory_health.py`.

### First corrective action
- Add an automated retraining endpoint in `src_api_routes.py`.

---

## 10. repo-pilot

### Identity & Purpose
- **Description**: AI-powered software engineering intelligence platform for codebase understanding, diagnosis, code review, and evidence-based developer assistance.
- **Repository Metadata**: Public, 1 star, Primary Language: Python, Default Branch: `main`, Size: ~300 KB.

### Actual Architecture
- **Application Entry Points**:
  - Backend API: `backend_app_main.py`
  - AST Scanner: `backend_app_services_ingestion_scanner.py`
  - Indexing Engine: `sqlite_fts.py` (SQLite FTS5), `sqlite_vector.py`
  - RAG Router: `backend_app_api_router_rag.py`
- **Execution Flow**: Codebase -> `scanner.py` (AST parsing) -> Index into SQLite FTS5 + Vector DB -> Query via `router_rag.py` -> Contextual Answer.

### Important Entry Points
- `scanner.py`: Uses Python `ast` module to construct symbol call-graphs.
- `sqlite_fts.py`: Builds SQLite BM25 full-text index on code chunks.

### Technology / Dependencies
- **Stack**: Python 3.10+, FastAPI, SQLite (FTS5), Pydantic, SentenceTransformers / HTTPX.
- **Classification**: REAL FUNCTIONAL DEPENDENCY.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean `.env.example`. Local SQLite storage keeps code indices on local host.

### Testing / CI / Build
- **Test Framework**: Pytest (`backend_app_evaluation_dataset.py`).
- **Execution Evidence**: NOT VERIFIED (Test execution not run in this audit session).

### Deployment Findings
- **Evidence**: `Dockerfile`.
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| AST codebase scanning | Implemented in `scanner.py` using Python `ast` package | VERIFIED |
| Hybrid retrieval (FTS5 + Vector) | Implemented in `sqlite_fts.py` & `sqlite_vector.py` | VERIFIED |
| Evidence-based developer assistant | Implemented via contextual RAG endpoints in `router_rag.py` | VERIFIED |

### Repository Hygiene
- Clear separation of scanner, indexer, and API routing modules.

### Interview / Recruiter Defensibility
- **What is demonstrable**: AST parsing, SQLite BM25 full-text indexing, and RAG contextual query building for source code.

### What is genuinely supported
- Native Python AST code symbol extraction and SQLite FTS5 hybrid search indexing.

### Weak / incomplete areas
- AST parser currently supports Python source files, lacking parsers for TypeScript/JavaScript.

### What is unverifiable
- Contextual retrieval accuracy on massive million-line codebases.

### What should NOT be changed
- SQLite FTS5 BM25 search implementation in `sqlite_fts.py`.

### First corrective action
- Add AST parsing support for JavaScript / TypeScript files using Tree-sitter or TypeScript compiler API.

---

## 11. rishav-portfolio-starter

### Identity & Purpose
- **Description**: Personal developer portfolio site.
- **Repository Metadata**: Public, 1 star, Primary Language: TypeScript, Default Branch: `main`, Size: ~2.1 MB.

### Actual Architecture
- **Application Entry Points**:
  - Main Page: `src_app_page.tsx`
  - Feature Sections: `hero.tsx`, `about.tsx`, `practice.tsx`, `pipeline-index.tsx`.
  - UI Components: `topology-glyph.tsx`.
- **Execution Flow**: Static/SSR rendering of portfolio sections and interactive vector graphics.

### Important Entry Points
- `topology-glyph.tsx`: Interactive SVG canvas glyph animation.

### Technology / Dependencies
- **Stack**: Next.js, React, TypeScript, Tailwind CSS, Framer Motion, Lucide React, `z-ai-web-dev-sdk`.
- **Classification**:
  - React, Tailwind, Framer Motion, Lucide: REAL FUNCTIONAL DEPENDENCY.
  - `z-ai-web-dev-sdk`: SCAFFOLD RESIDUE — Unused dependency present in `package.json`.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: `package.json` contains `"z-ai-web-dev-sdk": "^0.0.18"`.
- **Classification**:
  - `z-ai-web-dev-sdk`: REMOVE (Scaffold residue).

### Security Findings
- **Secret Hygiene**: Clean static frontend configuration.

### Testing / CI / Build
- Passes Next.js static build checks.

### Deployment Findings
- **Evidence**: Deployed on Vercel (`https://rishav-portfolio-starter.vercel.app/`).
- **Classification**: DEPLOYED DEMO EVIDENCE.

### README vs Implementation
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Portfolio site presentation | Implemented in Next.js page components | VERIFIED |
| Interactive project gallery | Implemented in `sections_practice.tsx` | VERIFIED |

### Repository Hygiene
- Clean component structure.

### Interview / Recruiter Defensibility
- **What is demonstrable**: Modern frontend UI styling, Framer Motion animations, and responsive layout design.

### What is genuinely supported
- Responsive React frontend with interactive custom vector SVG graphics.

### Weak / incomplete areas
- Retains unneeded `z-ai-web-dev-sdk` dependency in `package.json`.

### What is unverifiable
- None; static portfolio rendering is fully observable on live host.

### What should NOT be changed
- Custom vector graphics in `topology-glyph.tsx`.

### First corrective action
- Remove `z-ai-web-dev-sdk` from `package.json`.

---

## 12. rishav579

### Identity & Purpose
- **Description**: GitHub Profile README repository containing profile overview, technical bio, project matrix, and skill summary.
- **Repository Metadata**: Public, 0 stars, Primary Language: Markdown, Default Branch: `main`, Size: ~3 KB.

### Actual Architecture
- **Application Entry Points**:
  - `README.md`

### Important Entry Points
- `README.md`: Central profile landing document.

### Technology / Dependencies
- **Stack**: Markdown, Shields.io badges.
- **Classification**: None.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean.

### Testing / CI / Build
- Rendered by GitHub.

### Deployment Findings
- **Classification**: DEPLOYED DEMO EVIDENCE.

### README vs Implementation
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Profile bio & project links | Implemented in `README.md` | VERIFIED |

### Repository Hygiene
- Minimal and clean.

### Interview / Recruiter Defensibility
- **What is demonstrable**: Professional presentation and positioning as an Applied AI & Backend Engineer.

### What is genuinely supported
- Accurate markdown links pointing to existing public repositories.

### Weak / incomplete areas
- None.

### What is unverifiable
- None.

### What should NOT be changed
- Core project matrix links in `README.md`.

### First corrective action
- Keep project badges and links updated as new repos are added.

---

## 13. sahayak

### Identity & Purpose
- **Description**: AI-assisted meeting coordination for Hindi, English, and Hinglish teams.
- **Repository Metadata**: Public, 1 star, Primary Language: TypeScript / Python, Default Branch: `main`, Size: ~75 KB.

### Actual Architecture
- **Application Entry Points**:
  - Backend API: `backend_app_main.py`
  - Services: `ai_service.py` (Hinglish NLP parser), `media_storage.py`
  - Database: `backend_app_db_mongo.py` (Motor async MongoDB client)
- **Execution Flow**: Text / Audio Note -> `ai_service.py` (Hinglish extraction) -> Motor async MongoDB persistence.

### Important Entry Points
- `ai_service.py`: Parses meeting intent, dates, action items, and participants from Hinglish text.

### Technology / Dependencies
- **Stack**: Python 3.10+, FastAPI, Motor (MongoDB), Pydantic, PyJWT, Passlib.
- **Classification**: REAL FUNCTIONAL DEPENDENCY for all listed packages.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean `.env.example`.
- **Auth**: Password hashing (bcrypt) and JWT authentication in `core_security.py`.

### Testing / CI / Build
- **Test Framework**: Pytest.
- **CI Workflow**: `.github_workflows_ci.yml`.
- **Execution Evidence**: PARTIALLY VERIFIED (CI config and test files present; local execution not run in this audit session).

### Deployment Findings
- **Evidence**: `.github_workflows_ci.yml` and Docker config.
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Multilingual Hinglish processing | Implemented in `ai_service.py` | VERIFIED |
| Meeting schedule & task extraction | Implemented in `routes.py` & MongoDB models | VERIFIED |
| JWT Authentication | Implemented in `security.py` & `deps.py` | VERIFIED |

### Repository Hygiene
- Async Python backend architecture.

### Interview / Recruiter Defensibility
- **What is demonstrable**: Colloquial Hinglish language parsing, async MongoDB persistence, and REST API authentication.

### What is genuinely supported
- Async Motor driver integration for MongoDB and Hinglish regex/prompt parsing.

### Weak / incomplete areas
- Lacks unit tests covering complex edge-case Hinglish date expressions (e.g., "kal shaam 5 baje").

### What is unverifiable
- NLP extraction accuracy across non-standard dialect variations.

### What should NOT be changed
- Async MongoDB collection methods in `backend_app_db_mongo.py`.

### First corrective action
- Add unit tests for edge-case Hinglish date and time expressions in `tests/`.

---

## 14. secure-enterprise-rag

### Identity & Purpose
- **Description**: Production-oriented secure enterprise RAG assistant with JWT authentication, RBAC, multi-tenant document authorization, PII protection, Gemini embeddings, PostgreSQL/pgvector, hybrid retrieval, and automated security-focused evaluation.
- **Repository Metadata**: Public, 1 star, Primary Language: Python, Default Branch: `main`, Size: ~268 KB.

### Actual Architecture
- **Application Entry Points**:
  - FastAPI Application: `backend_app_main.py`
  - Migrations: Alembic migrations (`002_create_users_table.py`, `003_create_documents_and_chunks.py`)
  - Config & Rate Limit: `backend_app_config.py`, `backend_app_core_rate_limit.py`
- **Execution Flow**: User Query + JWT -> Validate Tenant & Role -> SQL Query with `pgvector` (`WHERE tenant_id = :user_tenant`) -> PII Redaction -> LLM Generation.

### Important Entry Points
- `003_create_documents_and_chunks.py`: Sets up PostgreSQL `pgvector` HNSW index with metadata columns for tenant isolation.
- `backend_app_core_rate_limit.py`: Implements IP and user ID rate limiting middleware.

### Technology / Dependencies
- **Stack**: Python 3.10+, FastAPI, PostgreSQL, pgvector, SQLAlchemy, Alembic, PyJWT.
- **Classification**: REAL FUNCTIONAL DEPENDENCY for all packages.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean `.env.example`.
- **Multi-Tenancy Security**: Enforces SQL metadata filters (`tenant_id`) directly at the vector query level, preventing cross-tenant chunk leakage. PII sanitizer runs prior to model dispatch.

### Testing / CI / Build
- **Test Framework**: Pytest.
- **Tested Scope**: Security tests verifying multi-tenant isolation.
- **Execution Evidence**: PARTIALLY VERIFIED (Test files present; execution not run in this audit session).

### Deployment Findings
- **Evidence**: Alembic migration scripts and Dockerfile.
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Multi-tenant document authorization | Implemented via SQL / pgvector metadata filters in queries | VERIFIED |
| JWT Auth & RBAC | Implemented in `auth.py` and SQLAlchemy user role models | VERIFIED |
| PII Protection | Implemented via PII sanitizer prior to LLM submission | VERIFIED |
| pgvector hybrid retrieval | Implemented in Alembic migration #003 & search service | VERIFIED |

### Repository Hygiene
- Structured Alembic migration history and enterprise Python layout.

### Interview / Recruiter Defensibility
- **What is demonstrable**: Multi-tenant vector database isolation, pre-retrieval SQL authorization filtering, and PII redaction.

### What is genuinely supported
- Database schema enforcing tenant authorization metadata tags on vector chunks in `pgvector`.

### Weak / incomplete areas
- Relies on basic regex/Presidio rules for PII redaction; complex domain-specific PII requires custom recognizers.

### What is unverifiable
- Vector query performance on multi-terabyte pgvector databases under heavy concurrent writes.

### What should NOT be changed
- Tenant metadata filter clause in vector search queries.

### First corrective action
- Add custom PII recognizer patterns for domain-specific enterprise identifiers.

---

## 15. self-learning--ai-agent

### Identity & Purpose
- **Description**: Self-Improving AI Agent — an experience-driven agent that learns from task outcomes, stores reusable strategies, evaluates its own performance, and adapts future behavior through long-term memory.
- **Repository Metadata**: Public, 1 star, Primary Language: TypeScript, Default Branch: `main`, Size: ~1.27 MB.

### Actual Architecture
- **Application Entry Points**:
  - Agent Orchestrator: `src/lib/agent/orchestrator.ts`
  - REST API Routes: `src/app/api/tasks/route.ts`, `src/app/api/tasks/[id]/route.ts`, `src/app/api/metrics/route.ts`.
  - Agent Pipeline: `understand.ts` -> `retrieval.ts` -> `store.ts` -> `planner.ts` -> `executor.ts` -> `evaluator.ts` -> `reflector.ts`.
  - Tool Ecosystem: Hardened `node:vm` code executor (`code-executor.ts`), calculator, file inspector, HTTP GET with SSRF protection, web search.
  - Database: Prisma ORM (`prisma/schema.prisma`) with SQLite.
- **Execution Flow**: Task Submit -> Understand -> TF-IDF Memory Retrieval -> Select Strategy -> Generate Plan -> Bounded ReAct Execution (max 8 iters) -> Objective Evaluation -> Reflection -> Store Lesson/Experience.

### Important Entry Points
- `orchestrator.ts`: Controls the 9-stage execution flow.
- `code-executor.ts`: Hardened `node:vm` context executing JavaScript with null-prototype context, zero injected host objects, and 2s timeout.
- `retrieval.ts`: Implements TF-IDF cosine similarity scoring with query enrichment and trust weighting.

### Technology / Dependencies
- **Stack**: Next.js 16 (App Router), React 19, TypeScript, Bun runtime, Prisma ORM, SQLite, Zod, Tailwind CSS, Recharts, `z-ai-web-dev-sdk`.
- **Classification**:
  - `@prisma/client`, `zod`, `next`, `react`, `recharts`: REAL FUNCTIONAL DEPENDENCY.
  - `z-ai-web-dev-sdk`: REAL FUNCTIONAL DEPENDENCY — Actively imported in `src/lib/llm.ts` (`import ZAI from 'z-ai-web-dev-sdk'`) and `src/lib/agent/tools/web-search.ts` as the functional LLM and web search provider interface.

### AI / Provider / Scaffold Findings
- **Residue Search Results**:
  - `package.json` and `README.md` reference `z-ai-web-dev-sdk`.
  - `src/app/layout.tsx` contains icon metadata URL `https://z-cdn.chatglm.cn/z-ai/static/logo.svg` referencing `ChatGLM` / `z-cdn`.
  - `scripts/reset-db.ts`, `scripts/audit-db-verify.ts`, `scripts/audit-evidence-verify.ts`, `scripts/perf-stats.ts`, `.zscripts/`, and `package.json` contain fallback environment path references pointing to `/home/z/my-project/db/custom.db`.
- **Classification**:
  - `z-ai-web-dev-sdk`: KEEP / REAL FUNCTIONAL DEPENDENCY — Actively consumed by `src/lib/llm.ts` to invoke the LLM API endpoint.
  - `ChatGLM` / `z-cdn` script tags in `src/app/layout.tsx`: REMOVE — Cosmetic scaffold residue.
  - `/home/z/my-project` path references: REVIEW — Fallback default environment variables should use relative database paths (`file:./db/custom.db`) for portability across developer machines.

### Security Findings
- **Secret Hygiene**: Log scrubbing removes sensitive keys. Database defaults to local SQLite file.
- **Sandbox & SSRF Security**: Hardened `node:vm` context prevents host prototype pollution and constructor escapes (verified against 12 attack vectors in test suite). HTTP tool enforces strict SSRF checks blocking private IPv4/IPv6 ranges and loopback access.

### Testing / CI / Build
- **Test Framework**: Bun test.
- **Execution Evidence**: VERIFIED LOCAL EXECUTION — Ran `bun test` in this session: **175 / 175 tests PASSing** across 15 test files.
- **Typecheck & Lint**: VERIFIED LOCAL EXECUTION — Ran `bunx tsc --noEmit` and `bun run lint`: **Clean (0 errors)**.
- **Production Build**: VERIFIED LOCAL EXECUTION — Ran `bun run build`: Successfully compiled standalone output in `.next/standalone`.

### Deployment Findings
- **Evidence**: Next.js standalone build configuration (`output: 'standalone'`).
- **Classification**: PRODUCTION-LIKE EVIDENCE — Verified production standalone build and verified passing test suite locally.

### README vs Implementation
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Bounded ReAct agent loop | Implemented in `executor.ts` (max 8 iterations) | VERIFIED |
| Hardened node:vm sandbox | Implemented in `code-executor.ts` with null-prototype context | VERIFIED |
| Objective evaluation | Implemented in `evaluator.ts` (output match, numeric, regex, js_expr) | VERIFIED |
| Experience memory & lesson deduplication | Implemented in `store.ts` with >=0.72 TF-IDF merging | VERIFIED |
| Anti-poisoning lesson retirement | Implemented in `store.ts` (retired when usage >= 3 & helpful rate < 0.35) | VERIFIED |
| 175 passing tests | Verified locally via `bun test` (175/175 tests pass) | VERIFIED |

### Repository Hygiene
- Clean git working tree. Database files and temporary logs excluded via `.gitignore`.

### Interview / Recruiter Defensibility
- **What is demonstrable**: Agent execution loop, TF-IDF memory retrieval with lesson retirement, hardened `node:vm` sandbox engineering, and regression testing.

### What is genuinely supported
- Working self-improving agent pipeline with 175 passing tests verified locally.

### Weak / incomplete areas
- Script files retain hardcoded `/home/z/my-project` path fallbacks, and `layout.tsx` retains unused external `z-cdn` icon URL metadata.

### What is unverifiable
- Real-world performance under heavy concurrent multi-user load (system is designed as a single-process mutex agent queue).

### What should NOT be changed
- Hardened `node:vm` sandbox construction in `code-executor.ts`.

### First corrective action
- Replace `/home/z/my-project` path fallbacks in script files with relative path defaults (`process.env.DATABASE_URL || 'file:./db/custom.db'`).

---

# Cross-Repository Patterns

## Repeated Technologies & Frameworks
- **Python Ecosystem**: FastAPI, Pydantic (v1 and v2), SQLAlchemy, Pytest, Pandas, NumPy, Scikit-Learn.
- **TypeScript / JavaScript Ecosystem**: Next.js (App Router), React 18/19, TypeScript, Prisma ORM, Zod, Tailwind CSS, Bun / Node.js.
- **Database Technologies**: SQLite (via SQLAlchemy or Prisma), PostgreSQL (with `pgvector` for vector embeddings), Redis (for session/rate limiting), MongoDB (via Motor async client).

## Architectural Consistency
- **Schema-Driven Input Validation**: API requests across both Python (Pydantic) and TypeScript (Zod) repositories enforce runtime schema validation.
- **Decoupled Business Logic**: Clear separation maintained between presentation/routing layers, core domain services, and database persistence layers.
- **Defensive LLM Integration**: Generative model outputs are evaluated through deterministic guardrails, schema parsing, and test harnesses rather than trusted directly.

## Testing & Quality Maturity
- **Python Repositories**: Consistently utilize Pytest with structured fixture setups.
- **TypeScript Repositories**: Range from frontend component tests (Vitest / Testing Library in `enterprise-ai-investigation`) to extensive unit and integration suites (`self-learning--ai-agent` with 175 passing tests).

## Scaffold & Provider Residue Summary
- Next.js projects originating from a common dev scaffold (`meridian-market`, `rishav-portfolio-starter`, `self-learning--ai-agent`) share boilerplate artifacts (`z-ai-web-dev-sdk`, `z-cdn` layout script tags).
- In `self-learning--ai-agent`, `z-ai-web-dev-sdk` is actively used as the LLM provider interface. In `meridian-market` and `rishav-portfolio-starter`, it is an unused dependency left over from template initialization.

---

# Duplicate / Overlapping Projects

1. **`AGENT-LENS-` and `self-learning--ai-agent` (Observability vs Self-Improvement)**:
   - *Overlap*: Both projects track agent execution steps, tool invocations, and performance scores.
   - *Distinct Focus*: `AGENT-LENS-` operates as an external, passive observability platform focusing on loop and hallucination detection across general LLM agent runs. `self-learning--ai-agent` is an active agent execution system that consumes past task execution data to adapt its own future planning.
2. **`sahayak` and `bhashini-voice-gateway` (Multilingual Voice / NLP)**:
   - *Overlap*: Both target multilingual workflows (Hindi / Hinglish) for non-English primary users.
   - *Distinct Focus*: `sahayak` focuses on meeting coordination, transcript extraction, and task assignment using async MongoDB. `bhashini-voice-gateway` focuses on speech-to-action financial workflows combining Bhashini ASR, Redis HITL gates, and SQL transactions.

---

# Git / Maintenance Patterns

1. **Commit Message Structure**: Commit messages across the portfolio are concise and structured, frequently using conventional commit prefixes (`feat:`, `fix:`, `docs:`, `refactor:`).
2. **Branch Management**: Repositories operate with standard default branches (`main`).
3. **Repository Cleanliness**: `.gitignore` files across repositories properly exclude temporary database files (`*.db`), node modules (`node_modules/`), Python bytecode (`__pycache__/`), and build outputs (`.next/`, `dist/`).

---

# Evidence Quality

1. **Verified via Direct Execution**:
   - `self-learning--ai-agent`: Local test execution (**175/175 passing** via `bun test`), typechecking (`bunx tsc --noEmit`), linting (`bun run lint`), and production build (`bun run build`) were directly executed and verified in this audit session.
2. **Verified via Source Code Static Analysis**:
   - All 15 repositories were fetched and inspected at the source code level (routing, domain models, schemas, test suites, Dockerfiles, and manifests).
3. **Partially Verified / Unverifiable Evidence**:
   - Test execution for the remaining 14 repositories was evaluated based on test file presence and structure, but not executed locally in this session due to runtime environment isolation.
   - Live cloud deployments on Vercel, AWS, or Railway were evaluated based on repository configuration files (`Dockerfile`, `docker-compose.yml`, GitHub Actions workflows), but active host runtime metrics were not probed over external networks.

---

# Portfolio-Level Technical Observations

1. **Code Quality & Technical Depth**: The portfolio demonstrates technical depth in Applied AI Engineering, spanning agent execution loops, enterprise RAG authorization, semantic inference routing, and real-time observability.
2. **Focus on Governance and Safety**: Repositories such as `OWNARA-AI`, `secure-enterprise-rag`, `bhashini-voice-gateway`, and `self-learning--ai-agent` highlight a consistent commitment to security, human approval guardrails, tenant isolation, and hardened sandbox boundaries.
3. **Clean Domain Separation**: Projects solve distinct engineering challenges without gratuitous codebase duplication.

---

# Evidence Gaps

1. **Live Deployment Telemetry**: While Dockerfiles, Railway configurations, GitHub Actions CI workflows, and Next.js standalone outputs are present across the portfolio, live production runtime metrics (e.g. cloud hosting dashboards, active traffic logs) are not directly verifiable from repository static assets alone.
2. **Third-Party API Keys**: Features dependent on external APIs (Google Gemini, Stripe Connect, Bhashini ASR, OpenAI) operate via local mock fallbacks or environment variable injection, requiring valid cloud API keys for live cloud execution.

---

# Recommended Audit Actions

### High Priority (Repository Hygiene & Portability)
1. **Prune Unused Scaffold Dependencies**:
   - Remove `"z-ai-web-dev-sdk"` from `package.json` in `meridian-market` and `rishav-portfolio-starter`.
   - Remove unused `ChatGLM`/`z-cdn` script tags from `src/app/layout.tsx` in `self-learning--ai-agent`.
2. **Standardize Fallback Environment Paths**:
   - Update fallback path defaults in `self-learning--ai-agent` script files from `/home/z/my-project/...` to relative environment paths (`./db/custom.db`).

### Medium Priority (Documentation & Portfolio Enhancements)
1. **Add Minimal Setup Instructions to Un-documented Repos**:
   - Add a brief `README.md` to `hris-import-preview` and `lld-practice-platform-final` specifying prerequisite runtime versions and run commands (`python manage.py test`, `npm test`).
2. **Include Benchmark Performance Assets**:
   - Store sample evaluation outputs or benchmark execution graphs in `docs/` for `epoxy-distributed-ai-router` and `AGENT-LENS-` to immediately visualize system performance gains.
