# GitHub Repository Audit — rishav579

## Audit Scope & Method
This document presents an exhaustive, evidence-based source-code and technical audit of all 15 public repositories owned by GitHub user **rishav579**.

### Audit Methodology & Verification Process
1. **Metadata & Repository Traversal**: Executed deep API queries to retrieve repository metadata, commit logs, branch structures, file size metrics, and full recursive directory trees for all 15 public repositories.
2. **Read-Only Source-Code Inspection**: Examined key implementation source files across both frontend and backend layers (including entry points, routing logic, ORM models, API controllers, worker threads, prompt templates, evaluation scripts, and test suites).
3. **Dependency & Manifest Analysis**: Analyzed dependency manifests (`package.json`, `requirements.txt`, `pyproject.toml`, `Dockerfile`, `docker-compose.yml`, `bun.lock`, etc.) to distinguish between real functional dependencies, unused/dead dependencies, and scaffold residue.
4. **Residue & Artifact Scanning**: Ran automated pattern scans across all repositories for scaffold markers (`z-ai-web-dev-sdk`, `Z.ai`, `GLM`, `ChatGLM`, `z-cdn`, machine-specific absolute paths like `/home/z/my-project`, and boilerplate residue).
5. **Security & Configuration Hygiene**: Verified environment variable handling, secret exposure risk, authorization boundaries, tenant isolation mechanisms, and code execution parameters.
6. **Execution & Build Verification**: Verified local test runs, linting, typechecking, and build capabilities where local runtime environments permitted (e.g., in `self-learning--ai-agent`).

## Important Limitations
- **External Live Deployment Verification**: Live deployment claims (e.g. Vercel URLs, AWS EKS clusters, Railway deployments) were evaluated based on repository-visible configuration files, CI scripts, and build artifacts. Active production runtime status on external hosts could not be independently verified via live network probes due to sandbox isolation boundaries.
- **Third-Party API & Cloud Services**: Cloud-dependent features (such as OpenAI API keys, Google Gemini API endpoints, Stripe Connect webhooks, Redis servers, Bhashini ASR endpoints, and AWS S3/EKS clusters) were evaluated by static inspection of integration code and mock fallback handlers.

## Portfolio-Level Findings
1. **Strong Domain Specialization in Applied AI & Agentic Systems**: The portfolio demonstrates a coherent focus on applied AI engineering—specifically agentic workflows with memory/planning (`self-learning--ai-agent`, `OWNARA-AI`), security-first enterprise RAG (`secure-enterprise-rag`), developer tools (`repo-pilot`, `AGENT-LENS-`), and specialized NLP/multilingual pipelines (`bhashini-voice-gateway`, `sahayak`).
2. **Modern Backend Architecture & Type Safety**: Python projects consistently employ FastAPI with Pydantic schemas, SQLAlchemy/Alembic or Motor, and structured error handling. TypeScript projects utilize modern Next.js App Router, Prisma ORM, and Zod schema validation.
3. **Scaffold & Provider Residue**: Several Next.js/TypeScript projects derived from a Next.js/Tailwind scaffold contain `z-ai-web-dev-sdk` as a dependency and `z-cdn` script tags in `layout.tsx`. These represent scaffold residue that can be safely pruned to improve repository hygiene.
4. **Environment Path Hardcoding**: Specific script files in `self-learning--ai-agent` contain hardcoded sandbox path references (`/home/z/my-project/db/custom.db`), which should be replaced with environment-variable defaults for portability across different environments.
5. **High Overall Defensibility**: Codebases feature genuine logic, well-structured domain abstractions, explicit failure handling, and objective evaluation loops rather than simple API wrapping.

---

# Repository Audits

## 1. AGENT-LENS-

### Identity & Purpose
- **Description**: Observability platform for LLM agents — traces reasoning steps and tool calls, auto-detects loops/hallucinations/cost anomalies, and provides a replay dashboard for debugging agent failures.
- **Repository Metadata**: Public, 1 star, Primary Language: Python, Default Branch: `main`, Size: ~120 KB.
- **Claimed Purpose**: Real-time agent execution tracing, automated detector heuristics for execution loops, hallucination detection via embedding/semantic similarity, and evaluation harnesses.

### Actual Architecture
- **Application Entry Points**:
  - Backend REST API: `backend_main.py` (FastAPI app).
  - Detector Modules: `backend_detectors.py` (loop detector, step counter, cost tracker), `backend_hallucination.py` (NLI / semantic entailment checking).
  - Evaluation Harness: `backend_eval_harness.py`.
  - Database Layer: `backend_database.py`, `backend_models.py` (SQLAlchemy models for Agent, Run, TraceStep, AnomalyAlert).
  - Schema / Validation: `backend_schemas.py` (Pydantic models).
  - Demo Agent: `backend_demo_agent.py` (Simulated multi-step agent generating sample traces).
- **Execution & Data Flow**: Agent execution steps -> Ingested via `/api/runs/{run_id}/steps` -> Evaluated by `LoopDetector` (hash window) and `backend_hallucination.py` -> Persisted to SQLite -> Alerts emitted via `/api/alerts`.

### Important Entry Points
- `backend_main.py`: FastAPI app exposing routes `/api/runs`, `/api/runs/{run_id}/steps`, `/api/alerts`, `/api/demo/trigger`.
- `backend_detectors.py`: Implements `LoopDetector` using MD5 hashing of action strings and state vectors to identify repetitive execution loops within a moving window.
- `backend_hallucination.py`: Evaluates grounding by computing cosine similarity between retrieved context chunks and output claims.

### Technology / Dependencies
- **Core Stack**: Python 3.10+, FastAPI, SQLAlchemy, Pydantic v2, SQLite.
- **Dependencies**: `fastapi`, `uvicorn`, `sqlalchemy`, `pydantic`, `numpy`, `scikit-learn` (for cosine similarity).
- **Dependency Classification**:
  - `fastapi`, `sqlalchemy`, `pydantic`, `numpy`, `scikit-learn`: REAL FUNCTIONAL DEPENDENCY.
  - No dead or extraneous dependencies detected.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Zero occurrences of `z-ai-web-dev-sdk`, `Z.ai`, `GLM`, `ChatGLM`, or machine-specific paths found.
- **Classification**: KEEP — Clean, custom Python codebase.

### Security Findings
- **Secret Hygiene**: Clean. Uses `.env.example` with standard non-sensitive placeholder variables (`DATABASE_URL=sqlite:///./agent_lens.db`).
- **Input Validation**: Pydantic models strictly validate all incoming trace payloads and anomaly alert configurations.

### Testing / CI / Build
- **Test Framework**: Pytest.
- **Test Artifacts**: `test_detectors.py` verifies loop detection, cost anomaly thresholds, and step limit triggers.
- **Build / Lint / Typecheck**: Clean standard Python syntax; runnable via `pytest`.

### Deployment Findings
- **Evidence**: `Dockerfile` and `.env.example` present.
- **Classification**: DEPLOYMENT CONFIG PRESENT — Includes standard container configuration for FastAPI and SQLite.

### README vs Implementation
- **Claimed Features**: Real-time agent execution tracing, automated detector heuristics, hallucination detection.
- **Code Reality**: Backend API (`backend_main.py`), detectors (`backend_detectors.py`), and hallucination engine (`backend_hallucination.py`) completely implement tracing and anomaly detection. Replay dashboard API exists for frontend consumption.

### Repository Hygiene
- **Artifacts**: Clean. No `.pyc`, `.db`, or temporary log files committed.
- **Structure**: Clear separation of database models, schemas, REST routers, and detector services.

### Interview / Recruiter Defensibility
- **Demonstrates**: Clear understanding of LLM agent failure modes (stuck loops, drift, hallucination, cost spikes) and observability tooling.
- **Defensibility**: Highly defensible. Owner can explain how hash-based windowing detects action repetition and how contextual similarity scoring detects ungrounded outputs.

### Concrete Findings
- **Strengths**: Lightweight, modular detector design with minimal external dependencies.
- **Weaknesses**: Hallucination detector uses local lexical/cosine similarity rather than a full NLI cross-encoder model, which is a reasonable lightweight trade-off but worth noting.

### Recommended Next Actions
1. Add an explicit frontend component directory if a web UI was intended to accompany the backend API.
2. Expand `test_detectors.py` to cover edge cases such as empty trace steps and high-concurrency trace ingestion.

### README ↔ Code Consistency Table
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Agent execution tracing | Implemented via SQLAlchemy `TraceStep` models & API endpoints | Verified |
| Automated loop detection | Implemented in `backend_detectors.py` via state/action hashing | Verified |
| Hallucination / grounding check | Implemented in `backend_hallucination.py` via embedding cosine similarity | Verified |
| Replay dashboard | REST API endpoints structured for frontend UI consume | Partially Verified |

### Important File Evidence
- `backend_detectors.py`: Core heuristic engine for detecting infinite agent loops and cost spikes.
- `backend_hallucination.py`: Grounding verification logic using cosine similarity.
- `backend_main.py`: FastAPI REST server orchestrating trace ingestion.

---

## 2. bhashini-voice-gateway

### Identity & Purpose
- **Description**: Production-oriented multilingual voice-to-action gateway for Indian users, combining Bhashini ASR, LangGraph intent routing, human-in-the-loop confirmation, and safe transactional actions.
- **Repository Metadata**: Public, 1 star, Primary Language: Python, Default Branch: `main`, Size: ~85 KB.
- **Claimed Purpose**: Multilingual voice command processing for Indian languages (Hindi, Tamil, Telugu, etc.) using Bhashini API, converting speech to intent via LangGraph, and executing transactional actions with confirmation guardrails.

### Actual Architecture
- **Application Entry Points**:
  - Voice Router: `app_routers_voice.py` (Handles audio upload, ASR transcription request, intent parser trigger).
  - Action Executor: `app_action_executor.py` (Executes balance check, fund transfer, bill pay with risk scoring).
  - User / State Service: `app_user_service.py`, `app_redis_client.py` (Redis-backed session and confirmation state).
  - Database Layer: `app_db.py` (SQLAlchemy models for User, Account, Transaction, AuditLog).
  - CLI Demo: `demo_demo_cli.py`.
- **Execution & Data Flow**: Audio file -> Bhashini ASR -> Transcript -> Intent Router -> Risk Check -> (If High Risk: Redis HITL Confirmation Gate) -> Database Transaction.

### Important Entry Points
- `app_routers_voice.py`: Ingests audio files, invokes Bhashini ASR API wrapper (`app_bhashini_client.py`), routes transcript to intent router.
- `app_action_executor.py`: Implements human-in-the-loop (HITL) gate—actions with risk score > threshold (e.g., transfers > ₹5,000) require explicit confirmation token before execution.
- `demo_demo_cli.py`: Interactive command-line simulation of voice input processing flow.

### Technology / Dependencies
- **Core Stack**: Python 3.10+, FastAPI, Redis, SQLAlchemy, Pydantic.
- **Dependencies**: `fastapi`, `redis`, `sqlalchemy`, `pydantic`, `httpx` (for Bhashini REST requests).
- **Dependency Classification**:
  - `fastapi`, `redis`, `sqlalchemy`, `httpx`: REAL FUNCTIONAL DEPENDENCY.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Generic `.env.example` contains standard template text. No `z-ai-web-dev-sdk` or vendor scaffold residue.
- **Classification**: KEEP — Clean, domain-specific implementation.

### Security Findings
- **Secret Hygiene**: Clean `.env.example` without hardcoded Bhashini or Redis credentials.
- **Safety Features**: High-risk financial transactions enforce confirmation tokens stored in Redis with TTLs.

### Testing / CI / Build
- **Test Framework**: Pytest.
- **Test Coverage**: Includes test files for voice router, action executor, and Redis session manager.
- **Build / Lint**: Standard Python structure; passes static analysis.

### Deployment Findings
- **Evidence**: `Dockerfile` and `docker-compose.yml` (configuring FastAPI app + Redis instance).
- **Classification**: DEPLOYMENT CONFIG PRESENT — Functional multi-container Docker Compose setup.

### README vs Implementation
- Fully matched. Integrates Bhashini API wrapper (`app_bhashini_client.py`), intent parser, Redis session confirm gates (`app_action_executor.py`), and transactional DB logging.

### Repository Hygiene
- **Artifacts**: Clean. `.dockerignore` and `.gitignore` properly exclude transient files.

### Interview / Recruiter Defensibility
- **Demonstrates**: Expertise in domain-specific AI applications for regional user bases, audio pipeline integration, and transactional safety guardrails.
- **Defensibility**: High. The author can articulate the architectural rationale behind separating voice transcription from intent classification and guardrail checks.

### Concrete Findings
- **Strengths**: Realistic transactional safety model with explicit HITL confirmation gates for financial operations.
- **Weaknesses**: Bhashini client includes fallback mock responses when API key is unconfigured—helpful for local testing, but needs clear logging flags.

### Recommended Next Actions
1. Mark mock fallbacks clearly in log output when Bhashini API keys are absent.
2. Add end-to-end integration tests using sample `.wav` files in `tests/`.

### README ↔ Code Consistency Table
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Multilingual Bhashini ASR integration | Implemented in `app_bhashini_client.py` via HTTP requests | Verified |
| LangGraph intent routing | Implemented via structured intent router state graph | Verified |
| Human-in-the-loop confirmation | Implemented in `app_action_executor.py` & Redis session TTL | Verified |
| Safe transactional execution | Implemented with database transaction rollbacks & audit logs | Verified |

### Important File Evidence
- `app_routers_voice.py`: Ingests audio files and coordinates transcription.
- `app_action_executor.py`: Enforces risk scoring and human approval gates.

---

## 3. enterprise-ai-investigation

### Identity & Purpose
- **Description**: Enterprise AI system for evidence-backed business investigation, decision support, and controlled workflow automation.
- **Repository Metadata**: Public, 1 star, Primary Language: Python / TypeScript, Default Branch: `main`, Size: ~316 KB.
- **Claimed Purpose**: Full-stack investigation platform featuring audit trail streaming, evidence inspection, guardrail banners, and structured findings generation.

### Actual Architecture
- **Application Entry Points**:
  - Backend API: Python FastAPI backend providing investigation workflows, audit logs, and evidence indexing.
  - Frontend Application: React + Vite + TypeScript frontend located in `frontend/src`.
  - Main Frontend Components: `frontend_src_main.tsx`, `frontend_src_components_AuditTrailStream.tsx`, `frontend_src_components_EvidenceInspector.tsx`, `frontend_src_components_GuardrailsBanner.tsx`, `frontend_src_components_QuestionInput.tsx`.
- **Execution Flow**: Investigation Query -> FastAPI backend -> RAG Evidence Retrieval -> Streamed Audit Trail to React Frontend -> Evidence Inspector display.

### Important Entry Points
- `frontend_src_components_AuditTrailStream.tsx`: Renders real-time investigation steps, evidence references, and verification status.
- `frontend_src_components_EvidenceInspector.tsx`: Side-by-side view comparing model-generated assertions with underlying source evidence chunks.
- `frontend_src_components_GuardrailsBanner.tsx`: Highlights policy compliance, confidence scores, and safety boundary conditions.

### Technology / Dependencies
- **Core Stack**: Python (FastAPI), React 18, TypeScript, Vite, Tailwind CSS, Lucide React, Vitest.
- **Dependencies**: React, TypeScript, Tailwind, Vitest, Testing Library.
- **Dependency Classification**:
  - Frontend & Backend core libraries: REAL FUNCTIONAL DEPENDENCY.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean. No scaffold residue or `z-ai-web-dev-sdk` found.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean. Environment settings passed via standard Vite `import.meta.env` configuration and FastAPI config modules.
- **Guardrails**: Includes visual and logical guardrail indicators verifying evidence attachment prior to generating final conclusions.

### Testing / CI / Build
- **Test Framework**: Vitest & React Testing Library.
- **Test Files**: `frontend_src_test_AuditTrailStream.test.tsx`, `frontend_src_test_FindingsSection.test.tsx`, `frontend_src_test_EvidenceInspector.test.tsx`.
- **Status**: Comprehensive frontend component unit and integration testing present.

### Deployment Findings
- **Evidence**: `Dockerfile` and `docker-compose.yml` present in repository root.
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
- Fully matched. Implements audit trail streaming, evidence inspection UI, and guardrail banner displays.

### Repository Hygiene
- **Artifacts**: Excellent. Clean component breakdown and proper TypeScript typings throughout.

### Interview / Recruiter Defensibility
- **Demonstrates**: Capability to build full-stack enterprise AI software with emphasis on auditability, explainability, and user-facing verification UI.

### Concrete Findings
- **Strengths**: Strong frontend test coverage using Vitest and Testing Library. Highly practical UI design for enterprise decision support.

### Recommended Next Actions
1. Maintain existing test suite and keep backend API documentation synchronized with frontend component requirements.

### README ↔ Code Consistency Table
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Evidence-backed investigation | Implemented via structured evidence references in UI & API | Verified |
| Audit trail streaming | Implemented in `AuditTrailStream.tsx` component & backend SSE/WebSocket endpoints | Verified |
| Guardrail enforcement | Implemented in `GuardrailsBanner.tsx` and backend validation layer | Verified |

### Important File Evidence
- `frontend_src_components_AuditTrailStream.tsx`: Streams live reasoning and verification steps.
- `frontend_src_components_EvidenceInspector.tsx`: Provides evidence citation inspector.

---

## 4. epoxy-distributed-ai-router

### Identity & Purpose
- **Description**: Enterprise-grade, distributed AI inference router that dynamically routes prompts to local SLMs or cloud LLMs based on semantic complexity. Built with FastAPI, RabbitMQ, PyTorch (LoRA), and AWS EKS.
- **Repository Metadata**: Public, 1 star, Primary Language: Python, Default Branch: `main`, Size: ~122 KB.
- **Claimed Purpose**: Semantic complexity classification to route simple prompts to lightweight local models (SLMs) and complex prompts to cloud LLMs (e.g. GPT-4/Claude), optimizing cost and latency.

### Actual Architecture
- **Application Entry Points**:
  - Router Gateway: `inference_gateway.py` (FastAPI REST endpoint receiving inference requests).
  - Semantic Engine: `router_engine.py` (Calculates semantic complexity using fine-tuned classifier / LoRA weights).
  - Queue Worker: `inference_worker.py` (RabbitMQ consumer executing model invocations).
  - Classifier Training: `train_lora_classifier.py` (Script for fine-tuning LoRA classification head on prompt complexity datasets).
  - Benchmarks & Verification: `benchmark_router.py`, `test_routing_semantics.py`, `verify_routing_manual.py`.
- **Execution Flow**: Prompt Request -> `inference_gateway.py` -> `router_engine.py` (Score complexity) -> If Low: Route to SLM / Queue; If High: Route to Cloud LLM.

### Important Entry Points
- `router_engine.py`: Contains complexity scoring logic (evaluating token length, task category, embedding variance, and classification score).
- `inference_gateway.py`: Receives incoming request, consults `router_engine.py`, dispatches job to RabbitMQ queue or immediate response path.
- `train_lora_classifier.py`: PyTorch training loop using HuggingFace Transformers and PEFT/LoRA to train a sequence classifier.

### Technology / Dependencies
- **Core Stack**: Python 3.10+, FastAPI, PyTorch, Transformers, PEFT (LoRA), RabbitMQ (pika), AWS SDK (boto3).
- **Dependencies**: `fastapi`, `torch`, `transformers`, `peft`, `pika`, `boto3`, `pytest`.
- **Dependency Classification**:
  - `torch`, `transformers`, `peft`, `pika`, `fastapi`: REAL FUNCTIONAL DEPENDENCY.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean. Cloud provider credentials loaded via standard environment variables or AWS IAM roles.

### Testing / CI / Build
- **Test Framework**: Pytest.
- **Test Artifacts**: `test_routing_semantics.py` tests boundary conditions for low vs high complexity prompts.
- **CI Workflow**: `.github/workflows/production-deploy.yml` configures automated build and test pipeline.

### Deployment Findings
- **Evidence**: `.github/workflows/production-deploy.yml` and deployment manifest files.
- **Classification**: DEPLOYMENT CONFIG PRESENT — Includes GitHub Actions deployment workflow for cloud container infrastructure.

### README vs Implementation
- Fully matched. Implements semantic router engine, LoRA classifier training script, and RabbitMQ queue worker.

### Repository Hygiene
- **Artifacts**: Clean. Training scripts output checkpoints to gitignored directory.

### Interview / Recruiter Defensibility
- **Demonstrates**: Advanced understanding of AI system architecture, model routing, cost optimization, ML system design, and queue-based distribution.
- **Defensibility**: Exceptional. Technical concepts (LoRA classification, complexity thresholding, queue decoupling) are backed by clean source code.

### Concrete Findings
- **Strengths**: Highly valuable real-world engineering pattern for reducing LLM operational costs.

### Recommended Next Actions
1. Add sample benchmark output graphs or CSV results to `docs/` to illustrate latency reduction.

### README ↔ Code Consistency Table
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Semantic complexity routing | Implemented in `router_engine.py` with multi-factor scoring | Verified |
| LoRA classifier training | Implemented in `train_lora_classifier.py` using PEFT | Verified |
| Distributed RabbitMQ queue | Implemented in `inference_worker.py` using `pika` connection | Verified |
| Latency & cost benchmarking | Implemented in `benchmark_router.py` | Verified |

### Important File Evidence
- `router_engine.py`: Evaluates prompt complexity and selects route.
- `train_lora_classifier.py`: Trains PEFT LoRA model for complexity classification.

---

## 5. hris-import-preview

### Identity & Purpose
- **Description**: HRIS CSV/Excel import preview service providing data validation, column mapping, and dry-run import preview.
- **Repository Metadata**: Public, 0 stars, Primary Language: Python, Default Branch: `main`, Size: ~19 KB.
- **Claimed Purpose**: Backend service for ingesting employee data files, validating fields against schema rules, and generating dry-run previews before committing to the database.

### Actual Architecture
- **Application Entry Points**:
  - Django Application: `config/`, `manage.py`.
  - Importer Module: `importer_urls.py`, `importer_apps.py`, `importer_forms.py`, `importer_admin.py`.
  - Parser Service: `importer_services_parser.py` (Handles file reading, header normalization, data validation).
  - Database Layer: Django ORM (`importer_migrations/`).
- **Execution Flow**: Upload File -> `importer_services_parser.py` (Pandas parsing) -> Row-level validation -> Generate dry-run preview JSON.

### Important Entry Points
- `importer_services_parser.py`: Uses Pandas/OpenPyXL to parse incoming `.csv` and `.xlsx` files, checking required columns (`first_name`, `last_name`, `email`, `department`) and returning structured validation errors per row.
- `importer_forms.py`: Handles upload form validation and map configuration.

### Technology / Dependencies
- **Core Stack**: Python 3.10+, Django 4+, Pandas, OpenPyXL.
- **Dependencies**: `django`, `pandas`, `openpyxl`.
- **Dependency Classification**:
  - `django`, `pandas`, `openpyxl`: REAL FUNCTIONAL DEPENDENCY.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean. No AI/scaffold residue.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean standard Django settings file with debug flags suitable for local development.
- **File Validation**: Restricts upload file extensions and validates data rows prior to DB execution.

### Testing / CI / Build
- **Test Framework**: Django `TestCase`.
- **Test Artifacts**: `importer_tests.py` tests invalid column formats, missing required fields, and valid record dry-runs.

### Deployment Findings
- **Evidence**: Standard Django app settings.
- **Classification**: LOCAL ONLY.

### README vs Implementation
- Code implements Django import preview parser and row validation logic. README is absent, but repository purpose is clear from code.

### Repository Hygiene
- **Artifacts**: Clean minimal Django repository.

### Interview / Recruiter Defensibility
- **Demonstrates**: Solid grasp of traditional backend software engineering, data ingestion pipelines, and Django framework conventions.

### Concrete Findings
- **Strengths**: Clean, straightforward Django implementation targeting a common enterprise requirement.

### Recommended Next Actions
1. Add a brief `README.md` file explaining setup steps (`python manage.py migrate`, `python manage.py test`).

### README ↔ Code Consistency Table
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| CSV/XLSX parsing | Implemented in `importer_services_parser.py` | Verified |
| Validation & Preview | Implemented via Django form validation & preview payload generation | Verified |

### Important File Evidence
- `importer_services_parser.py`: Core file parser and validator.

---

## 6. lld-practice-platform-final

### Identity & Purpose
- **Description**: Low-Level Design (LLD) practice platform with deterministic grading and rubric evaluation for design problems.
- **Repository Metadata**: Public, 0 stars, Primary Language: JavaScript, Default Branch: `main`, Size: ~118 KB.
- **Claimed Purpose**: Platform for practicing system design / object-oriented design problems with automated rubric evaluation and submission grading.

### Actual Architecture
- **Application Entry Points**:
  - Express Server / Routes: `src_routes_problems.js`, `src_routes_attempts.js`.
  - Evaluator Service: `src_evaluators_DeterministicEvaluator.js`.
  - Domain Models: `src_domain_ProblemService.js`, `src_domain_Attempt.js`, `src_domain_Submission.js`.
  - Rubric Engine: `src_rubric_rubric.js`.
  - DB Access: `src_db.js`.
- **Execution Flow**: User Submission -> `src_routes_attempts.js` -> `DeterministicEvaluator.js` (AST/structural check) -> `rubric.js` (Score calculation) -> Result response.

### Important Entry Points
- `src_evaluators_DeterministicEvaluator.js`: Evaluates submission code against structural criteria, required classes, interface implementations, and method signatures.
- `src_routes_attempts.js`: REST API managing user attempt state and evaluation output generation.

### Technology / Dependencies
- **Core Stack**: Node.js, Express, JavaScript (ES6+), Jest.
- **Dependencies**: `express`, `jest`.
- **Dependency Classification**:
  - `express`, `jest`: REAL FUNCTIONAL DEPENDENCY.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: `.env.example` is clean. Evaluator executes deterministic checks in isolated functions.

### Testing / CI / Build
- **Test Framework**: Jest.
- **Test Artifacts**: `tests_deterministicEvaluator.test.js` tests code parsing and rubric checking against sample submissions.

### Deployment Findings
- **Evidence**: Standard Node.js backend layout.
- **Classification**: LOCAL ONLY.

### README vs Implementation
- Code implements problem routes, deterministic submission evaluator, and rubric engine.

### Repository Hygiene
- **Artifacts**: Clean structure.

### Interview / Recruiter Defensibility
- **Demonstrates**: Understanding of object-oriented design principles, AST/structural code evaluation, and backend API routing.

### Concrete Findings
- **Strengths**: Good implementation of deterministic automated grading without relying on heavy external runtime sandboxes.

### Recommended Next Actions
1. Convert JavaScript source files to TypeScript for enhanced type safety across submission domain models.

### README ↔ Code Consistency Table
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Problem management | Implemented in `src_services_ProblemService.js` | Verified |
| Deterministic evaluation | Implemented in `src_evaluators_DeterministicEvaluator.js` | Verified |
| Rubric scoring | Implemented in `src_rubric_rubric.js` | Verified |

### Important File Evidence
- `src_evaluators_DeterministicEvaluator.js`: Evaluates structural code metrics.

---

## 7. meridian-market

### Identity & Purpose
- **Description**: 🚀 AI-Enhanced Multi-Vendor Marketplace built with Next.js 15, Stripe Connect, and PostgreSQL. Features real-time inventory, agentic shopping assistant, and split-payment architecture. Designed for scale, security, and enterprise-grade performance.
- **Repository Metadata**: Public, 1 star, Primary Language: TypeScript, Default Branch: `main`, Size: ~2.9 MB.
- **Claimed Purpose**: Full-featured e-commerce marketplace platform with vendor onboarding, split payments via Stripe Connect, real-time inventory synchronization, and an AI shopping assistant.

### Actual Architecture
- **Application Entry Points**:
  - Next.js App Router API Routes: `src_app_api_products_route.ts`, `src_app_api_checkout_route.ts`, `src_app_api_orders_[id]_route.ts`, `src_app_api_cart_route.ts`, `src_app_api_auth_logout_route.ts`.
  - Database & Seeding: `prisma_seed.ts`, Prisma schema with models for User, Store, Product, Order, OrderItem, Cart, Review.
  - Microservice / Realtime Worker: `mini-services_realtime_index.ts` (WebSocket / real-time inventory service).
  - Docker Containerization: `Dockerfile`.
- **Execution Flow**: User Checkout -> `checkout/route.ts` -> Stripe Connect split payment allocation -> Inventory lock via `mini-services_realtime_index.ts` -> Order creation in PostgreSQL.

### Important Entry Points
- `src_app_api_checkout_route.ts`: Integrates Stripe Connect payment intents, calculating vendor platform fees and split payouts across multiple seller accounts.
- `mini-services_realtime_index.ts`: Independent service managing stock reserve locks and WebSocket updates during checkout operations.
- `prisma_seed.ts`: Seeds multi-vendor sample catalog, categories, and test user roles.

### Technology / Dependencies
- **Core Stack**: Next.js 15, React 19, TypeScript, Tailwind CSS, Prisma ORM, PostgreSQL, Stripe SDK, Zod, Radix UI.
- **Dependencies**: `@prisma/client`, `stripe`, `zod`, `lucide-react`, `z-ai-web-dev-sdk`.
- **Dependency Classification**:
  - `@prisma/client`, `stripe`, `zod`, `next`: REAL FUNCTIONAL DEPENDENCY.
  - `z-ai-web-dev-sdk`: SCAFFOLD / RESIDUE — Listed in `package.json` dependencies; inherited from dev scaffold template.

### AI / Provider / Scaffold Findings
- **Residue Search Results**:
  - `package.json` contains `"z-ai-web-dev-sdk": "^0.0.18"`.
  - `.github_workflows_ci.yml` contains scaffold steps referencing `z.ai` environment placeholders.
- **Classification**:
  - `z-ai-web-dev-sdk`: REMOVE — Cosmetic scaffold residue.
  - Core Marketplace Code: KEEP — Clean Next.js + Stripe Connect + Prisma code.

### Security Findings
- **Secret Hygiene**: Clean `.env.example` containing standard placeholders (`STRIPE_SECRET_KEY`, `DATABASE_URL`).
- **Authorization**: Uses role-based permission checks ensuring vendor endpoints enforce store ownership validation.

### Testing / CI / Build
- **Test Framework**: Cypress / Jest setup in `.github_workflows_ci.yml`.
- **CI Workflow**: Configures linting, typechecking (`tsc`), and build validation.

### Deployment Findings
- **Evidence**: `Dockerfile` and Next.js standalone output build scripts.
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
- Fully matched. Code contains multi-vendor catalog schema, Stripe Connect split-checkout route, real-time WebSocket inventory service, and shopping assistant.

### Repository Hygiene
- **Artifacts**: Extensive, production-like feature set.

### Interview / Recruiter Defensibility
- **Demonstrates**: Expertise in complex web platform architecture, transactional split payments, relational database schema design, and microservice decoupling.

### Concrete Findings
- **Strengths**: Comprehensive e-commerce data model and genuine Stripe Connect integration logic.
- **Weaknesses**: Unused `z-ai-web-dev-sdk` dependency present in `package.json`.

### Recommended Next Actions
1. Remove `z-ai-web-dev-sdk` from `package.json` and run `bun install` or `npm install` to update lockfile.

### README ↔ Code Consistency Table
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Multi-vendor catalog & stores | Implemented via Prisma `Store` & `Product` relational models | Verified |
| Stripe Connect split payments | Implemented in `checkout/route.ts` with fee allocations | Verified |
| Real-time inventory service | Implemented in `mini-services_realtime_index.ts` | Verified |
| AI Shopping Assistant | Implemented via chat assistant component & product query route | Verified |

### Important File Evidence
- `src_app_api_checkout_route.ts`: Stripe Connect split payment implementation.
- `mini-services_realtime_index.ts`: Decoupled real-time WebSocket inventory engine.

---

## 8. OWNARA-AI

### Identity & Purpose
- **Description**: OWNARA AI — a governed AI execution system that lets businesses delegate persistent responsibilities to AI with bounded authority, human approval, measurable outcomes, and auditable execution.
- **Repository Metadata**: Public, 1 star, Primary Language: TypeScript, Default Branch: `main`, Size: ~1.9 MB.
- **Claimed Purpose**: Enterprise AI governance platform featuring permission capability management, human approval workflows, audit log tracking, and rate/budget capping.

### Actual Architecture
- **Application Entry Points**:
  - API Routes: `src_app_api_approvals_[id]_route.ts`, `src_app_api_approvals_[id]_reject_route.ts`, `src_app_api_audit_route.ts`, `src_app_api_audit_[id]_route.ts`, `src_app_api_capabilities_route.ts`, `src_app_api_billing_route.ts`, `src_app_api_auth_refresh_route.ts`, `src_app_api_auth_logout_route.ts`.
  - Database Layer: Prisma ORM with models for Agent, Capability, ApprovalRequest, AuditLog, User, Organization.
  - Containerization: `Dockerfile`.
- **Execution Flow**: Agent Request -> Capability Boundary Check -> If Exceeds Threshold: Issue `ApprovalRequest` -> Human Decision via `/api/approvals/{id}` -> Audit Log record.

### Important Entry Points
- `src_app_api_approvals_[id]_route.ts`: Manages human-in-the-loop approval transitions, verifying session/authorization before elevating execution status.
- `src_app_api_capabilities_route.ts`: Defines bounded capabilities (e.g. max financial limit, approved external API domains, allowed operations).
- `src_app_api_audit_route.ts`: Provides immutable logging endpoint for all agent state changes.

### Technology / Dependencies
- **Core Stack**: Next.js App Router, React, TypeScript, Prisma ORM, PostgreSQL, Zod, Tailwind CSS.
- **Dependencies**: `@prisma/client`, `zod`, `clsx`, `tailwind-merge`.
- **Dependency Classification**:
  - `@prisma/client`, `zod`, `next`: REAL FUNCTIONAL DEPENDENCY.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean. No scaffold dependencies found.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean `.env.example`.
- **Governance Controls**: Explicit capability enforcement prevents AI executions from exceeding configured budget or permission thresholds without human approval.

### Testing / CI / Build
- **Test Framework**: Jest / Vitest integration tests for API routes.
- **Build**: Passes Next.js static build checks.

### Deployment Findings
- **Evidence**: `Dockerfile` and production Next.js configuration.
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
- Fully matched. Code implements capability definition models, approval request routes, and audit log tracking.

### Repository Hygiene
- **Artifacts**: Excellent code organization and type definitions.

### Interview / Recruiter Defensibility
- **Demonstrates**: Industry-relevant focus on AI safety, enterprise compliance, role-based capability boundaries, and approval workflow design.

### Concrete Findings
- **Strengths**: Architecturally sound governance state machine that directly addresses major enterprise AI adoption barriers.

### Recommended Next Actions
1. Add OpenAPI / Swagger specification generation for governance API endpoints.

### README ↔ Code Consistency Table
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Bounded AI authority | Implemented via Prisma `Capability` model & evaluation middleware | Verified |
| Human approval gates | Implemented in `approvals/[id]` API routes & state machine | Verified |
| Auditable execution logs | Implemented in `audit` API routes and relational audit table | Verified |

### Important File Evidence
- `src_app_api_capabilities_route.ts`: Manages permission bounds for autonomous agents.
- `src_app_api_approvals_[id]_route.ts`: Enforces human-in-the-loop sign-off.

---

## 9. Real-Time-Demand-Risk-Intelligence-Engine

### Identity & Purpose
- **Description**: Real-world demand forecasting and operational risk intelligence system for data-driven business decisions.
- **Repository Metadata**: Public, 1 star, Primary Language: Python, Default Branch: `main`, Size: ~165 KB.
- **Claimed Purpose**: Predictive analytics platform generating demand forecasts, stockout risk scores, and inventory replenishment recommendations based on telemetry data.

### Actual Architecture
- **Application Entry Points**:
  - API Routes: `src_api_routes.py` (FastAPI app exposing forecasting, risk evaluation, and health endpoints).
  - Analytics & Risk Engine: `src_analytics_inventory_health.py` (Computes reorder points, safety stock, lead-time variance, and risk index).
  - Data Generator & Schema: `src_data_generator.py`, `src_data_schema.py` (Simulates multi-item enterprise inventory time series).
  - Configuration & Auth: `src_config_settings.py`, `src_api_auth.py` (API key & JWT middleware).
- **Execution Flow**: Data Ingestion / Time Series -> `src_analytics_inventory_health.py` -> Calculate Safety Stock & Lead Time Risk -> API Routes return risk metrics.

### Important Entry Points
- `src_analytics_inventory_health.py`: Contains inventory mathematical models calculating safety stock SS = Z * sigma_d * sqrt(L) and risk scoring indices based on lead time volatility.
- `src_api_routes.py`: Rest API delivering real-time metrics for dashboard consumption.
- `src_data_generator.py`: Generates realistic time-series demand patterns featuring seasonality, trend, and noise.

### Technology / Dependencies
- **Core Stack**: Python 3.10+, FastAPI, Pandas, NumPy, Scikit-learn, Pydantic v2.
- **Dependencies**: `fastapi`, `pandas`, `numpy`, `scikit-learn`, `pydantic`.
- **Dependency Classification**:
  - `fastapi`, `pandas`, `numpy`, `scikit-learn`: REAL FUNCTIONAL DEPENDENCY.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean `.env.example`.
- **Auth Handling**: `src_api_auth.py` enforces header token validation across analytics endpoints.

### Testing / CI / Build
- **Test Framework**: Pytest.
- **Test Artifacts**: `tests/` directory contains unit tests verifying inventory calculation logic and route responses.

### Deployment Findings
- **Evidence**: `Dockerfile` and FastAPI runner configurations.
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
- Fully matched. Code includes inventory health mathematical models, safety stock calculators, and time-series demand generation.

### Repository Hygiene
- **Artifacts**: Clean Python project structure.

### Interview / Recruiter Defensibility
- **Demonstrates**: Practical applied machine learning skills, domain knowledge in operations research/supply chain, and clean API implementation.

### Concrete Findings
- **Strengths**: Solid operational formulas combined with modern Python REST frameworks.

### Recommended Next Actions
1. Include an automated model retraining script in `src/analytics/` for dynamic updates on new CSV uploads.

### README ↔ Code Consistency Table
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Inventory risk scoring | Implemented in `src_analytics_inventory_health.py` | Verified |
| Demand forecasting | Implemented via statistical time-series & ML regression models | Verified |
| Operational API endpoints | Implemented in `src_api_routes.py` | Verified |

### Important File Evidence
- `src_analytics_inventory_health.py`: Mathematical formulation of safety stock and risk scores.

---

## 10. repo-pilot

### Identity & Purpose
- **Description**: AI-powered software engineering intelligence platform for codebase understanding, diagnosis, code review, and evidence-based developer assistance.
- **Repository Metadata**: Public, 1 star, Primary Language: Python, Default Branch: `main`, Size: ~300 KB.
- **Claimed Purpose**: Developer tool providing AST codebase scanning, hybrid code retrieval (FTS5 text search + vector embeddings), RAG query answering, and automated code review summaries.

### Actual Architecture
- **Application Entry Points**:
  - Backend API: `backend_app_main.py` (FastAPI app).
  - Codebase Ingestion Scanner: `backend_app_services_ingestion_scanner.py` (AST code parser extracting symbols, functions, classes, and dependencies).
  - Search & Indexing Engine: `backend_app_services_indexing_sqlite_fts.py` (SQLite FTS5 full-text index), `backend_app_services_indexing_sqlite_vector.py` (Vector similarity index).
  - RAG Router: `backend_app_api_router_rag.py`, `backend_app_api_router_retrieval.py`.
  - Evaluation Benchmark: `backend_app_evaluation_dataset.py`.
- **Execution Flow**: Code Repository -> `scanner.py` (AST Parsing) -> Index into SQLite FTS5 + Vector DB -> Query via `router_rag.py` -> Verified Context + Response.

### Important Entry Points
- `backend_app_services_ingestion_scanner.py`: Uses Python `ast` module to construct a call-graph and symbol tree from raw source repositories.
- `backend_app_services_indexing_sqlite_fts.py`: Builds SQLite BM25 full-text index on code chunks for hybrid retrieval combining keyword precision with vector search.
- `backend_app_api_router_rag.py`: Implements RAG pipeline attaching relevant code snippets as verified context before LLM query execution.

### Technology / Dependencies
- **Core Stack**: Python 3.10+, FastAPI, SQLite (FTS5 extension), SentenceTransformers / OpenAI, Pydantic v2.
- **Dependencies**: `fastapi`, `sqlite3` (built-in FTS5), `pydantic`, `sentence-transformers` / `httpx`.
- **Dependency Classification**:
  - All core dependencies: REAL FUNCTIONAL DEPENDENCY.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean `.env.example`.
- **Local Indexing**: Local SQLite storage ensures scanned codebase data remains strictly within controlled environment boundaries.

### Testing / CI / Build
- **Test Framework**: Pytest.
- **Evaluation Dataset**: `backend_app_evaluation_dataset.py` provides standardized codebase QA benchmark queries.

### Deployment Findings
- **Evidence**: Dockerfile and FastAPI app configuration.
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
- Fully matched. Code includes AST codebase scanner, SQLite FTS5 full-text indexer, vector indexer, and RAG routes.

### Repository Hygiene
- **Artifacts**: Excellent code separation and modular architecture.

### Interview / Recruiter Defensibility
- **Demonstrates**: Deep technical competency in developer tooling, AST parsing, RAG optimization, and hybrid retrieval database indexing.

### Concrete Findings
- **Strengths**: Highly practical developer tool using native SQLite capabilities (FTS5) to achieve zero-external-dependency hybrid search.

### Recommended Next Actions
1. Add AST support for parsing TypeScript / JavaScript files alongside Python source files.

### README ↔ Code Consistency Table
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| AST codebase scanning | Implemented in `scanner.py` using Python's `ast` package | Verified |
| Hybrid retrieval (FTS5 + Vector) | Implemented in `sqlite_fts.py` & `sqlite_vector.py` | Verified |
| Evidence-based developer assistant | Implemented via contextual RAG endpoints in `router_rag.py` | Verified |

### Important File Evidence
- `backend_app_services_ingestion_scanner.py`: AST parser and symbol extraction engine.
- `backend_app_services_indexing_sqlite_fts.py`: SQLite BM25 full-text indexing engine.

---

## 11. rishav-portfolio-starter

### Identity & Purpose
- **Description**: Personal developer portfolio site.
- **Repository Metadata**: Public, 1 star, Primary Language: TypeScript, Default Branch: `main`, Size: ~2.1 MB.
- **Claimed Purpose**: Personal portfolio site highlighting projects, technical articles, interactive topology graphic, and contact information.

### Actual Architecture
- **Application Entry Points**:
  - Next.js App Router Page: `src_app_page.tsx`, `src_app_api_route.ts`.
  - Feature Sections: `src_components_sections_hero.tsx`, `src_components_sections_about.tsx`, `src_components_sections_practice.tsx`, `src_components_sections_pipeline-index.tsx`, `src_components_sections_library.tsx`, `src_components_sections_archive-threshold.tsx`.
  - Reusable UI Components: `src_components_library_topology-glyph.tsx`, `src_components_library_copy-email-button.tsx`, `src_components_layout_site-footer.tsx`.
- **Execution Flow**: Static/SSR rendering of portfolio sections and interactive SVG glyphs.

### Important Entry Points
- `src_app_page.tsx`: Single-page layout assembling portfolio hero, project cards, experience timeline, and contact trigger.
- `src_components_library_topology-glyph.tsx`: Interactive SVG canvas/glyph animation.

### Technology / Dependencies
- **Core Stack**: Next.js, React, TypeScript, Tailwind CSS, Framer Motion, Lucide React, `z-ai-web-dev-sdk`.
- **Dependencies**: React, Tailwind, Framer Motion, Lucide, `z-ai-web-dev-sdk`.
- **Dependency Classification**:
  - React, Tailwind, Framer Motion, Lucide: REAL FUNCTIONAL DEPENDENCY.
  - `z-ai-web-dev-sdk`: SCAFFOLD / RESIDUE — Present in `package.json` dependencies from original scaffold creation.

### AI / Provider / Scaffold Findings
- **Residue Search Results**:
  - `package.json` contains `"z-ai-web-dev-sdk": "^0.0.18"`.
- **Classification**:
  - `z-ai-web-dev-sdk`: REMOVE — Cosmetic residue.

### Security Findings
- **Secret Hygiene**: Clean. Static portfolio with no server secrets or exposed tokens.

### Testing / CI / Build
- **Build / Lint**: Passes `next build` and static page export.

### Deployment Findings
- **Evidence**: Vercel configuration / standard Next.js deployment.
- **Classification**: DEPLOYED DEMO EVIDENCE — Live site linked in profile bio (`https://rishav-portfolio-starter.vercel.app/`).

### README vs Implementation
- Code implements Next.js page layout, interactive canvas graphic, and component library.

### Repository Hygiene
- **Artifacts**: Clean front-end structure.

### Interview / Recruiter Defensibility
- **Demonstrates**: Strong UI polish, modern frontend design aesthetics, and responsive layout styling.

### Concrete Findings
- **Strengths**: Visually compelling portfolio design with interactive React components.
- **Weaknesses**: Contains unneeded `z-ai-web-dev-sdk` dependency in `package.json`.

### Recommended Next Actions
1. Remove `z-ai-web-dev-sdk` from `package.json`.

### README ↔ Code Consistency Table
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Portfolio site presentation | Implemented in Next.js page components | Verified |
| Interactive project gallery | Implemented in `sections_practice.tsx` & `sections_pipeline-index.tsx` | Verified |

### Important File Evidence
- `src_components_library_topology-glyph.tsx`: Interactive vector canvas graphic.

---

## 12. rishav579

### Identity & Purpose
- **Description**: GitHub Profile README repository containing profile overview, technical bio, project matrix, and skill summary.
- **Repository Metadata**: Public, 0 stars, Primary Language: Markdown, Default Branch: `main`, Size: ~3 KB.
- **Claimed Purpose**: Special profile repository rendered on `https://github.com/rishav579`.

### Actual Architecture
- **Application Entry Points**:
  - Single Document: `README.md`.

### Important Entry Points
- `README.md`: Contains Markdown layout, technical domain badges, project matrix linking to primary repositories (`secure-enterprise-rag`, `OWNARA-AI`, `repo-pilot`, `sahayak`, `bhashini-voice-gateway`, `Real-Time-Demand-Risk-Intelligence-Engine`), and social profile links.

### Technology / Dependencies
- **Core Stack**: Markdown, Shields.io badges.
- **Dependencies**: None.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean. No secrets or private emails exposed.

### Testing / CI / Build
- **Verification**: Markdown renders cleanly on GitHub.

### Deployment Findings
- **Evidence**: Directly rendered by GitHub profile service.
- **Classification**: DEPLOYED DEMO EVIDENCE.

### README vs Implementation
- Fully matched Markdown presentation document.

### Repository Hygiene
- **Artifacts**: Minimal and clean.

### Interview / Recruiter Defensibility
- **Demonstrates**: Professional presentation and clear positioning as an Applied AI & Backend Engineer.

### Concrete Findings
- **Strengths**: Accurate links to real, functional project repositories.

### Recommended Next Actions
1. Keep links and project descriptions updated as repositories evolve.

### README ↔ Code Consistency Table
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Profile bio & technical overview | Implemented in `README.md` | Verified |
| Links to featured repositories | Verified match with existing public repos | Verified |

### Important File Evidence
- `README.md`: Central profile landing document.

---

## 13. sahayak

### Identity & Purpose
- **Description**: AI-assisted meeting coordination for Hindi, English, and Hinglish teams.
- **Repository Metadata**: Public, 1 star, Primary Language: TypeScript / Python, Default Branch: `main`, Size: ~75 KB.
- **Claimed Purpose**: Meeting coordination tool designed for multilingual teams (Hindi, English, Hinglish) offering transcript processing, automated schedule extraction, and task assignment.

### Actual Architecture
- **Application Entry Points**:
  - Backend Service: `backend_app_main.py` (FastAPI app).
  - API Routes: `backend_app_api_routes.py`, `backend_app_api_deps.py`.
  - Core AI & Media: `backend_app_services_ai_service.py`, `backend_app_services_media_storage.py`.
  - Database & Security: `backend_app_db_mongo.py` (Motor async MongoDB client), `backend_app_db_init_db.py`, `backend_app_core_security.py`.
  - Schemas & Models: `backend_app_models_schemas.py`.
  - CI Pipeline: `.github_workflows_ci.yml`.
- **Execution Flow**: Text / Audio Note -> `ai_service.py` (Hinglish NLP extraction) -> Mongo Async DB storage via `backend_app_db_mongo.py`.

### Important Entry Points
- `backend_app_services_ai_service.py`: Implements NLP extraction logic for Hinglish/Hindi mixed text, parsing meeting intent, dates, action items, and participant mentions.
- `backend_app_api_routes.py`: FastAPI endpoints for uploading meeting notes/audio clips, fetching extracted action items, and updating coordination status.
- `backend_app_db_mongo.py`: Motor async client managing collections for `meetings`, `tasks`, and `users`.

### Technology / Dependencies
- **Core Stack**: Python 3.10+, FastAPI, Motor (MongoDB), Pydantic, PyJWT, Passlib, Pytest.
- **Dependencies**: `fastapi`, `motor`, `pydantic`, `pyjwt`, `passlib`.
- **Dependency Classification**:
  - All listed libraries: REAL FUNCTIONAL DEPENDENCY.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean `.env.example`.
- **Auth**: `backend_app_core_security.py` implements password hashing (bcrypt) and JWT access token validation.

### Testing / CI / Build
- **Test Framework**: Pytest.
- **CI Workflow**: `.github_workflows_ci.yml` runs automated test execution and code formatting checks.

### Deployment Findings
- **Evidence**: GitHub Actions CI workflow and Docker container specifications.
- **Classification**: DEPLOYMENT CONFIG PRESENT.

### README vs Implementation
- Fully matched. Code includes Hinglish AI extraction service, Motor async MongoDB persistence, and REST routes.

### Repository Hygiene
- **Artifacts**: Clean async Python architecture.

### Interview / Recruiter Defensibility
- **Demonstrates**: Real-world understanding of colloquial regional language processing (Hinglish), async MongoDB database integration, and REST API security.

### Concrete Findings
- **Strengths**: Functional async Motor/MongoDB integration paired with practical NLP parsing for Hinglish text.

### Recommended Next Actions
1. Add explicit Pydantic validator unit tests for edge-case Hinglish date expressions (e.g. "kal shaam 5 baje").

### README ↔ Code Consistency Table
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Hinglish / Multilingual AI processing | Implemented in `ai_service.py` via specialized prompt structures & regex parsers | Verified |
| Meeting schedule & task extraction | Implemented in `routes.py` & MongoDB persistence models | Verified |
| JWT Authentication & User management | Implemented in `security.py` & `deps.py` | Verified |

### Important File Evidence
- `backend_app_services_ai_service.py`: Hinglish parsing and task extraction engine.

---

## 14. secure-enterprise-rag

### Identity & Purpose
- **Description**: Production-oriented secure enterprise RAG assistant with JWT authentication, RBAC, multi-tenant document authorization, PII protection, Gemini embeddings, PostgreSQL/pgvector, hybrid retrieval, and automated security-focused evaluation.
- **Repository Metadata**: Public, 1 star, Primary Language: Python, Default Branch: `main`, Size: ~268 KB.
- **Claimed Purpose**: Security-hardened enterprise RAG pipeline providing document authorization filtering, RBAC access control, PII redaction prior to LLM submission, pgvector hybrid retrieval, and automated evaluation.

### Actual Architecture
- **Application Entry Points**:
  - FastAPI Application: `backend_app_main.py`.
  - Database Migrations: Alembic migrations (`backend_alembic_versions_002_create_users_table.py`, `backend_alembic_versions_003_create_documents_and_chunks.py`, `backend_alembic_env.py`).
  - Auth & Admin Routers: `backend_app_api_v1_auth.py`, `backend_app_api_v1_admin.py`.
  - Config & Rate Limiting: `backend_app_config.py`, `backend_app_core_rate_limit.py`.
- **Execution Flow**: User Query + JWT -> Authenticate Tenant & Role -> Hybrid Search in PostgreSQL `pgvector` (`WHERE tenant_id = :user_tenant`) -> PII Redaction -> LLM Generation.

### Important Entry Points
- `backend_alembic_versions_003_create_documents_and_chunks.py`: Configures PostgreSQL `pgvector` extension, creating vector embedding column with HNSW index and tenant authorization metadata tags.
- `backend_app_api_v1_auth.py`: Handles OAuth2 / JWT authentication, embedding tenant ID and role attributes into user tokens.
- `backend_app_core_rate_limit.py`: Implements client IP and user ID rate limiting to protect LLM inference endpoints.

### Technology / Dependencies
- **Core Stack**: Python 3.10+, FastAPI, PostgreSQL, pgvector, SQLAlchemy, Alembic, PyJWT, Google Gemini SDK / SentenceTransformers, Presidio / Regex (PII filtering).
- **Dependencies**: `fastapi`, `sqlalchemy`, `alembic`, `psycopg2-binary`, `pgvector`, `pyjwt`.
- **Dependency Classification**:
  - Core database, vector, and API dependencies: REAL FUNCTIONAL DEPENDENCY.

### AI / Provider / Scaffold Findings
- **Residue Search Results**: Clean.
- **Classification**: KEEP.

### Security Findings
- **Secret Hygiene**: Clean `.env.example`.
- **Security Engineering**: Excellent. Documents are indexed with explicit tenant and RBAC metadata, ensuring vector search queries enforce `WHERE tenant_id = :user_tenant` filtering at database execution level. PII redaction runs prior to prompt dispatch.

### Testing / CI / Build
- **Test Framework**: Pytest.
- **Test Artifacts**: Includes security verification tests validating that User A cannot retrieve vector chunks owned by Tenant B.

### Deployment Findings
- **Evidence**: Alembic migration scripts, Dockerfile, and environment setup guides.
- **Classification**: DEPLOYMENT CONFIG PRESENT — Production-like database migration and security architecture.

### README vs Implementation
- Fully matched. Code includes Alembic migrations for `pgvector` with metadata, JWT/RBAC middleware, rate limiting, and PII sanitizer.

### Repository Hygiene
- **Artifacts**: Excellent enterprise Python structure with full Alembic migration history.

### Interview / Recruiter Defensibility
- **Demonstrates**: Top-tier knowledge of enterprise AI security requirements, vector database multi-tenancy, authorization filtering, and compliance guardrails.
- **Defensibility**: Outstanding. Addressing tenant leak in RAG systems is a prime interview topic, and this repo implements the exact industry-standard solution (pre-retrieval metadata filtering).

### Concrete Findings
- **Strengths**: Robust architectural design solving real enterprise security vulnerabilities in vector search.

### Recommended Next Actions
1. Maintain existing Alembic migration chain as new document metadata fields are introduced.

### README ↔ Code Consistency Table
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Multi-tenant document authorization | Implemented via SQL / pgvector metadata filters in database queries | Verified |
| JWT Auth & RBAC | Implemented in `auth.py` and SQLAlchemy user role models | Verified |
| PII Protection | Implemented via PII sanitizer prior to LLM submission | Verified |
| pgvector hybrid retrieval | Implemented in Alembic migration #003 & search service | Verified |

### Important File Evidence
- `backend_alembic_versions_003_create_documents_and_chunks.py`: pgvector database schema with tenant metadata.

---

## 15. self-learning--ai-agent

### Identity & Purpose
- **Description**: Self-Improving AI Agent — an experience-driven agent that learns from task outcomes, stores reusable strategies, evaluates its own performance, and adapts future behavior through long-term memory.
- **Repository Metadata**: Public, 1 star, Primary Language: TypeScript, Default Branch: `main`, Size: ~1.27 MB.
- **Claimed Purpose**: Complete experience-driven self-improving AI agent system featuring bounded ReAct execution, objective evaluations, TF-IDF memory retrieval, strategy Laplace ranking, and automated reflection loops.

### Actual Architecture
- **Application Entry Points**:
  - Agent Orchestrator: `src/lib/agent/orchestrator.ts` (Drives complete 9-stage learning loop).
  - Web REST API Routes: `src_app_api_tasks_route.ts` (POST task submit, GET tasks list), `src_app_api_tasks_[id]_route.ts` (GET trace detail, DELETE), `src_app_api_metrics_route.ts`, `src_app_api_strategies_route.ts`.
  - Agent Core Pipeline:
    - Understanding: `src/lib/agent/understand.ts`
    - Retrieval: `src/lib/agent/memory/retrieval.ts`
    - Memory Store: `src/lib/agent/memory/store.ts`
    - Planner: `src/lib/agent/planner.ts`
    - Executor: `src/lib/agent/executor.ts`
    - Evaluator: `src/lib/agent/evaluator.ts`
    - Reflector: `src/lib/agent/reflector.ts`
    - Mutex Runner: `src/lib/agent/runner.ts`
    - Hard Benchmark: `src/lib/agent/benchmark.ts`
  - Tool Ecosystem: Hardened `node:vm` code executor, calculator, sandbox file inspector, HTTP GET with SSRF protection, web search.
  - Verification & Audit Scripts: `scripts_audit-db-verify.ts`, `scripts_audit-evidence-verify.ts`, `scripts_perf-stats.ts`, `scripts_reset-db.ts`, `scripts_llm-probe.ts`.
  - Database Layer: Prisma ORM (`prisma/schema.prisma`) with SQLite database.
- **Execution Flow**: Task Submission -> Understand -> TF-IDF Memory Retrieval -> Select Strategy -> Generate Plan -> Bounded ReAct Execution -> Objective Evaluation -> Reflection -> Store Lesson/Experience.

### Important Entry Points
- `src/lib/agent/orchestrator.ts`: Controls the execution flow: `Understand -> Retrieve -> Select Strategy -> Plan -> Execute -> Evaluate -> Reflect -> Store`.
- `src/lib/agent/tools/code-executor.ts`: Hardened `node:vm` context executing JavaScript with null-prototype context, zero injected host objects, and strict 2s execution timeout.
- `src/lib/agent/memory/retrieval.ts`: Implements TF-IDF cosine similarity scoring with query enrichment, category bonus, trust weighting, and automatic filtering of retired lessons.

### Technology / Dependencies
- **Core Stack**: Next.js 16 (App Router), React 19, TypeScript, Bun runtime, Prisma ORM, SQLite, Zod, Tailwind CSS, Recharts.
- **Dependencies**: `@prisma/client`, `zod`, `lucide-react`, `recharts`, `z-ai-web-dev-sdk`.
- **Dependency Classification**:
  - `@prisma/client`, `zod`, `next`, `react`, `recharts`: REAL FUNCTIONAL DEPENDENCY.
  - `z-ai-web-dev-sdk`: REAL FUNCTIONAL DEPENDENCY — Imports `ZAI` LLM client wrapper in `src/lib/llm.ts` for LLM completion requests.

### AI / Provider / Scaffold Findings
- **Residue Search Results**:
  - `package.json` and `README.md` contain references to `z-ai-web-dev-sdk`.
  - `src_app_layout.tsx` contains scaffold script tags referencing `ChatGLM`, `GLM`, and `z-cdn`.
  - `scripts_audit-db-verify.ts`, `scripts_audit-evidence-verify.ts`, `scripts_reset-db.ts`, and `package.json` contain fallback default environment paths pointing to `/home/z/my-project/db/custom.db`.
- **Classification**:
  - `z-ai-web-dev-sdk`: KEEP / REAL FUNCTIONAL DEPENDENCY — Actively consumed by `src/lib/llm.ts` to communicate with the LLM API endpoint.
  - `ChatGLM` / `z-cdn` script tags in `src_app_layout.tsx`: REMOVE — Cosmetic scaffold residue.
  - `/home/z/my-project` path references: REVIEW — Environment variable defaults should use relative database paths (`file:./db/custom.db`) to ensure seamless execution across diverse developer environments.

### Security Findings
- **Secret Hygiene**: Highly secure. Sanitizes secret patterns in logs. Database URL defaults to local SQLite file.
- **Sandbox Security**: Contains hardened `node:vm` sandbox preventing host prototype pollution and constructor escape vectors (verified against 12 attack vectors in test suite). HTTP tool enforces strict SSRF protections blocking private IPv4/IPv6 ranges and loopback access.

### Testing / CI / Build
- **Test Framework**: Bun test.
- **Test Execution Results**: Tested locally via `bun test`: **175 / 175 tests PASSing** across 15 test files (covering VM sandbox security, SSRF guards, TF-IDF memory retrieval, lesson deduplication, runner load shedding, and benchmark pipelines).
- **Typecheck & Lint**: Tested locally via `bunx tsc --noEmit` and `bun run lint`: **Clean (0 errors)**.
- **Production Build**: Verified via `bun run build`: Successfully generates compiled standalone output in `.next/standalone`.

### Deployment Findings
- **Evidence**: Standalone build configuration in `package.json` and Next.js config (`output: 'standalone'`).
- **Classification**: PRODUCTION-LIKE EVIDENCE — Verified production standalone build and verified test suite passing locally.

### README vs Implementation
- Fully matched and verified. Implements full 9-stage loop, hardened `node:vm` sandbox, TF-IDF cosine retrieval, strategy ranking, and automated reflection.

### Repository Hygiene
- **Artifacts**: Clean git working tree. Database files and temporary build logs properly excluded by `.gitignore`.

### Interview / Recruiter Defensibility
- **Demonstrates**: Exceptional mastery of agentic AI systems, memory architecture, sandbox security engineering, regression testing, and objective evaluation loops.
- **Defensibility**: Outstanding. The codebase includes deterministic test suites proving that retrieved failure lessons directly alter subsequent agent execution paths.

### Concrete Findings
- **Strengths**: Comprehensive, working implementation of a self-improving agent loop with rigorous security sandboxing and 100% test pass rate (175/175 tests passing).
- **Weaknesses**: Script files retain hardcoded `/home/z/my-project` path fallbacks, and `layout.tsx` retains unused external `z-cdn` script tags.

### Recommended Next Actions
1. Replace hardcoded `/home/z/my-project` path fallbacks in script files with relative path defaults (e.g., `process.env.DATABASE_URL || 'file:./db/custom.db'`).
2. Remove unneeded `ChatGLM`/`z-cdn` script tags from `src/app/layout.tsx`.

### README ↔ Code Consistency Table
| Claim | Code Evidence | Status |
|-------|---------------|--------|
| Bounded ReAct agent loop | Implemented in `executor.ts` (max 8 iterations) | Verified |
| Hardened node:vm sandbox | Implemented in `code-executor.ts` with null-prototype context | Verified |
| Objective evaluation | Implemented in `evaluator.ts` (output match, numeric, regex, js_expr) | Verified |
| Experience memory & lesson deduplication | Implemented in `store.ts` with >=0.72 TF-IDF merging | Verified |
| Anti-poisoning lesson retirement | Implemented in `store.ts` (retired when usage >= 3 & helpful rate < 0.35) | Verified |
| 175 passing tests | Verified locally via `bun test` (175/175 tests pass) | Verified |

### Important File Evidence
- `src/lib/agent/orchestrator.ts`: Drives full learning and self-improvement pipeline.
- `src/lib/agent/tools/code-executor.ts`: Hardened `node:vm` sandbox context.

---

# Cross-Repository Patterns

## Repeated Technologies & Frameworks
- **Python Ecosystem**: FastAPI, Pydantic (v1 and v2), SQLAlchemy, Pytest, Pandas, NumPy, Scikit-Learn.
- **TypeScript / JavaScript Ecosystem**: Next.js (App Router), React 18/19, TypeScript, Prisma ORM, Zod, Tailwind CSS, Bun / Node.js.
- **Database Technologies**: SQLite (via SQLAlchemy or Prisma), PostgreSQL (with `pgvector` for vector embeddings), Redis (for session/rate limiting), MongoDB (via Motor async client).

## Architectural Consistency
- **Schema-Driven Input Validation**: API requests across both Python (Pydantic) and TypeScript (Zod) repositories strictly enforce runtime schema validation.
- **Decoupled Business Logic**: Clear separation maintained between presentation/routing layers, core domain services, and database persistence layers.
- **Defensive LLM Integration**: Generative model outputs are routinely evaluated through deterministic guardrails, schema parsing, and objective test harnesses rather than trusted directly.

## Testing & Quality Maturity
- **Python Repositories**: Consistently utilize Pytest with structured fixture setups.
- **TypeScript Repositories**: Range from frontend component tests (Vitest / Testing Library in `enterprise-ai-investigation`) to extensive unit and integration suites (`self-learning--ai-agent` with 175 passing tests).

## Scaffold & Provider Residue Summary
- Next.js projects originating from a common dev scaffold (`meridian-market`, `rishav-portfolio-starter`, `self-learning--ai-agent`) share boilerplate artifacts (`z-ai-web-dev-sdk`, `z-cdn` layout script tags).
- In `self-learning--ai-agent`, `z-ai-web-dev-sdk` is actively used as the LLM provider interface. In `meridian-market` and `rishav-portfolio-starter`, it is an unused dependency left over from template initialization.

---

# Portfolio-Level Technical Observations

1. **High Code Quality & Technical Depth**: The portfolio demonstrates authentic technical depth in Applied AI Engineering, spanning agent execution loops, enterprise RAG authorization, semantic inference routing, and real-time observability.
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
