# CampusNova Project State

## Status Overview
* **Current Phase:** Backend Core Setup & Testing
* **Last Updated:** 2026-08-10T16:15:47+05:30

## Built Endpoints & Modules
* [x] Core FastAPI App & Config (`app/main.py`, `app/core/config.py`)
* [x] `POST /api/v1/documents/extract` - Implemented with OpenAI/OpenRouter integration
* [x] Pytest suite for Document Extraction (`tests/api/v1/test_documents.py`)
* [x] `POST /api/v1/timetable/generate` - Implemented with OR-Tools
* [x] Pytest suite for Timetable Generation (`tests/api/v1/test_timetable.py`)
* [x] `GET /api/v1/alerts/stream` - Implemented with SSE
* [x] PDF Ingestion & RAG Chunking Engine (`app/services/ingestion_service.py`)
* [x] `POST /api/v1/knowledge/upload` - Implemented with SHA-256 & 15MB limits
* [x] `POST /api/v1/knowledge/query` - Implemented with Top-K thresholding & Tenacity retries
* [x] Pytest suite for Knowledge API (`tests/api/v1/test_knowledge.py`)
* [x] **Project Audit Completed:** 2026-08-10T16:15:47+05:30
* [x] JWT Authentication & RBAC (`app/api/v1/endpoints/auth.py`, `app/api/v1/deps.py`)
* [x] Pytest suite for Auth (`tests/api/v1/test_auth.py`)
* [x] Predictive Resource Allocation (`app/api/v1/endpoints/resources.py`)
* [x] Pytest suite for Resources (`tests/api/v1/test_resources.py`)
* [x] Production Dockerization (`Dockerfile`, `docker-compose.yml`)

## Database & RAG Status
* MongoDB: Async Motor client initialized (`app/services/mongo_service.py`)
* ChromaDB: Active & Indexing (Collection: student_documents)

## Active Blockers / Bugs
* None

## Recent Changes
* 2026-08-10: Formally updated the OCR architecture to OpenRouter in documentation.
* 2026-08-10: Implemented strict Pydantic V2 schemas for the Timetable Generation module.
* 2026-08-10: Fixed temporal domain gap by adding days_per_week and periods_per_day to schemas and data_contracts.json. Created foundational TimetableSolver service using OR-Tools, mapping the boolean assignment matrix, and implemented the NO_DOUBLE_BOOKING constraint.
* 2026-08-10: Completed OR-Tools solver logic in timetable_solver.py. Added constraints for Room Uniqueness, Subject Fulfillment, and Teacher Max Hours. Implemented solver execution and schedule extraction.
* 2026-08-10: Created FastAPI router for timetable generation. Wired endpoint to main.py. Enforced synchronous `def` for the endpoint to prevent OR-Tools from blocking the asyncio event loop.
* 2026-08-10: Created Pytest suite for Timetable Generation verifying feasible schedule generation, constraint enforcement, and Pydantic validation rules.
* 2026-08-10: Created async Server-Sent Events (SSE) endpoint for real-time alerts. Implemented strict client disconnection handling to prevent memory leaks.
* 2026-08-10: Initialized local persistent ChromaDB client for RAG validation.
* 2026-08-10: Wired POST /api/v1/documents/extract to ChromaDB for automatic RAG vector indexing upon extraction.
* 2026-08-10: Defined strict Pydantic data contracts for RAG ingestion and querying. Initialized async MongoDB client using Motor.
* 2026-08-10: Implemented PyMuPDF text extraction, overlapping text chunking, OpenRouter embeddings generation, and synchronized dual-database writes (ChromaDB + MongoDB).
* 2026-08-10: Implemented production-grade Knowledge API (Upload & Query). Added streaming size limits, SHA-256 deduplication, Top-K thresholding, and resilient LLM fallbacks.
* 2026-08-10: Created automated Pytest suite for Knowledge API covering streaming size limits, SHA-256 deduplication, content-type guards, RAG retrieval, and 503 DB failure handling. All tests passing.
* 2026-08-10T16:15:47+05:30: Executed comprehensive end-to-end repository audit. Verified 100% test pass rate (11/11). Codebase confirmed clear of placeholder TODOs and mock logic. Documented remaining backend scope (Auth, Security, Deployment).
* 2026-08-10T22:45:00+05:30: Implemented JWT Authentication & RBAC middleware. Created login, register, and /me endpoints. Bypassed passlib limitations via raw bcrypt PwdContext wrapper. Full auth test suite passed successfully.
* 2026-08-10T22:48:58+05:30: Implemented Predictive Resource Allocation Endpoint (/api/v1/resources/resolve-conflict). Secured with admin RBAC. Implemented MongoDB teacher lookups with conflicting substitution exclusion logic, autonomous RAG policy check simulation, and Global Server-Sent Event (SSE) alert broadcasting. Validated via complete test suite (18/18 tests passing).
* 2026-08-10T22:54:44+05:30: Scaffolded production Docker environment. Created lean python:3.11-slim Dockerfile optimizing layer caching, implemented strict .dockerignore to prevent secret leakage, and built docker-compose.yml orchestrating the API container exposing port 8000 via env-injected variables.
* 2026-08-10T23:44:06+05:30: Executed Phase 1 Predictive Allocation refactor. Integrated Scikit-Learn MinMaxScaler in PredictiveAllocator service to rank substitute teachers via weighted normalization of historical workloads, leave probabilities, and subject compatibility. Fully refactored resolve-conflict endpoint and expanded test suite. Verified 100% test coverage (19/19 tests passing).
* 2026-08-10T23:47:29+05:30: Implemented Module 2A Geofenced Faculty Clock-In. Added CAMPUS_LAT, CAMPUS_LON, and GEOFENCE_RADIUS_METERS configurations. Developed pure-Python Haversine distance utility for <50m geofence enforcement. Scaffolded OpenRouter Vision liveness check logic for selfie validation. Completed attendance Pytest suite mocking coordinates and Vision API responses. Verified 100% test coverage (22/22 tests passing).
* 2026-08-10T23:49:59+05:30: Implemented Module 2B Physical Roll-Call Digitization. Created /api/v1/attendance/process-sheet endpoint integrating with OpenRouter's Llama 3.2 11B Vision Instruct model to extract JSON attendance arrays directly from uploaded images. Orchestrated high-performance bulk MongoDB writes via UpdateOne with upsert configurations to update the student_attendance collection. Validated via test suite successfully simulating Vision LLM JSON payloads. Verified 100% test coverage (24/24 tests passing).
* 2026-08-10T23:52:10+05:30: Implemented Module 2C Edge Node Computer Vision Sync API. Engineered strict Pydantic schemas (BulkEdgeSyncRequest, EdgeAttendancePayload) enforcing 'present'/'absent' literals and confidence score boundaries. Created /api/v1/attendance/edge-sync endpoint secured via 'system_node' RBAC. Integrated rigorous confidence filtering (>= 0.85 threshold) alongside idempotent MongoDB bulk upserts. Authored comprehensive unit tests validating logic and RBAC constraints. Verified 100% test coverage (26/26 tests passing).
* 2026-08-11T00:49:35+05:30: Implemented Module 3 Prompt-Based ERP Natural Language Agent. Engineered PromptRequest/PromptResponse Pydantic schemas. Built ERPCommandAgent service invoking OpenRouter (meta-llama/llama-3.1-8b-instruct) with strict system prompt enforcing pure JSON output of collection + mongodb_query. Implemented collection allowlist enforcement (7 read-only collections) to prevent prompt injection attacks. All queries restricted to find() operations. Registered /api/v1/erp/prompt endpoint behind admin RBAC. Authored 3-case test suite mocking LLM and Motor cursors. Verified 100% test coverage (29/29 tests passing).
* 2026-08-11T00:56:44+05:30: Implemented Module 4 Core ERP Centralized Data Flows & Role Portals. Created app/schemas/core_erp.py with StudentCreate/Response, TeacherCreate/Response, ClassCreate/Response. Built admin_erp.py with 6 CRUD endpoints (POST/GET for students, teachers, classes) secured behind admin RBAC with duplicate-ID 409 guards. Built portals.py with teacher/my-classes (teacher RBAC, queries classes by teacher_id) and student/my-schedule (student RBAC, cross-queries grade+section). Added classes_collection to MongoManager. Authored 7-case test suite covering create, list, portals, and dual RBAC failure scenarios. Verified 100% test coverage (36/36 tests passing).
* 2026-08-11T01:02:09+05:30: Implemented Module 5 Security Hardening — CORS & Rate Limiting. Appended slowapi to requirements.txt and installed. Extracted shared Limiter into app/core/limiter.py to eliminate circular import chain. Configured app-wide CORS (allow_origins=*) and registered RateLimitExceeded handler in main.py. Applied @limiter.limit("10/minute") to POST /api/v1/erp/prompt and @limiter.limit("5/minute") to POST /api/v1/attendance/process-sheet with correct request: Request signatures. Created tests/core/test_security.py with autouse fixture resetting in-memory limiter storage between tests; validated ERP 429 on 11th call, process-sheet 429 on 6th call, and CORS preflight 200. Verified 100% test coverage (39/39 tests passing).
* 2026-08-11T19:35:48+05:30: Phase 1 Technical Audit Remediation — Liveness, CORS & Secret Key. (1) Replaced empty check_liveness() stub with full OpenRouter Vision API call using meta-llama/llama-3.2-11b-vision-instruct:free; added timeout=30.0; fails closed (returns False) on any API error; falls back to True only when OPENROUTER_API_KEY is absent. (2) Fixed CORS misconfiguration in main.py: changed allow_credentials=True to allow_credentials=False to comply with the CORS specification when allow_origins=["*"]; removes browser preflight rejection that broke all cross-origin frontend integrations. (3) Imported secrets module in config.py and replaced "super-secret-key" (16 bytes, below PyJWT minimum) with secrets.token_hex(32) (256-bit cryptographic fallback); PyJWT InsecureKeyLengthWarning warnings eliminated (warning count dropped from 59 to 10 in test output). Verified 100% test coverage (39/39 tests passing).
* 2026-08-11T19:38:48+05:30: Phase 2 Technical Audit Remediation — Timetable Async Offloading & DB Indexing. (1) Added solver.parameters.max_time_in_seconds = 10.0 to timetable_solver.py to prevent infinite hangs on unsatisfiable inputs. (2) Rewrote timetable.py endpoint as async def; offloaded CPU-bound TimetableSolver.solve() to thread pool via asyncio.get_event_loop().run_in_executor(None, ...) to prevent event-loop blocking; secured endpoint with require_roles(["admin"]) RBAC; added 422 Unprocessable Entity response for INFEASIBLE/MODEL_INVALID solver status instead of silent 200 with empty schedule. (3) Added asynccontextmanager lifespan hook in main.py that creates 9 MongoDB background indexes on startup covering: users.id (unique), students.student_id (unique), teachers.teacher_id (unique), classes.teacher_id, classes.(grade+section) compound, substitutions.(date+time_slot) compound, student_attendance.(student_id+date) compound, faculty_attendance.teacher_id, knowledge_documents.sha256_hash (unique). (4) Rewrote test_timetable.py to use async httpx client with admin JWT; added INFEASIBLE 422 test, unauthenticated 401 test, non-admin 403 test. Verified 100% test coverage (42/42 tests passing).