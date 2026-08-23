# Deployment Readiness Audit

**Status:** baseline captured — remediation required before deployment  
**Scope:** current `CampusNova` repository, audited 2026-08-23

## Repository baseline

- The repository was initially nested one level below the supplied workspace root.
- The working tree contains 88 modified tracked files and 197 untracked files.
- No current user changes were removed, moved, staged, committed, or overwritten during this audit.
- The outer workspace has duplicate copies of `attendance_sheet_2026_08_22.pdf` and `attendance_sheet_2026_08_22.png`; both pairs are byte-identical to copies in this repository.

## Release validation results

| Check | Result | Notes |
| --- | --- | --- |
| Frontend type check | Pass | `tsc --noEmit` exits successfully. |
| Frontend production build | Pass | Next.js successfully compiles, type-checks, collects page data, and generates 17 static pages. Running it requires a normal environment that permits child worker processes. |
| Backend syntax compilation | Pass | All Python modules under `backend/app` compile successfully. |
| Backend automated tests | Blocked | `backend/venv` does not contain `pytest`, despite `pytest` being declared in `backend/requirements.txt`. Recreate the environment from pinned requirements before relying on test results. |
| Diff whitespace check | Fail | Existing changes contain trailing whitespace and extra final blank lines across backend, frontend, tests, and seed scripts. Fix during source-quality refactoring. |

## Cleanup classification

| Category | Current paths | Release treatment |
| --- | --- | --- |
| Generated dependencies/build output | `frontend/node_modules` (422 MB), `frontend/.next` (671 MB), `backend/venv` | Do not commit or deploy as source; recreate in CI/build environment. |
| Runtime data | `backend/uploads` (selfies), `backend/chroma_db`, root `chroma_db` | Do not commit; migrate to managed/persistent storage before release. |
| Temporary/test output | `backend/scratch`, `.pytest_cache`, `backend/.pytest_cache`, attendance exports | Exclude from release repository; retain locally only when needed. |
| Test fixtures | `test_files` | Keep only if tests require them; otherwise retain outside deployment image. |
| Product documentation | `screenshots` | Keep selected screenshots only if they are actively used by the README/product documentation. |
| Demo data and credentials | `scripts/seed_demo_data.py` | Must be isolated from production initialization; never seed demo accounts or passwords into production. |

## Deployment blockers

1. Flatten the nested repository only after resolving the duplicate outer-root artifacts.
2. Replace the hard-coded default application secret with a required production environment variable.
3. Restrict API CORS to the deployed frontend domain; current application startup allows every origin.
4. Correct Docker environment-file handling and add independent frontend deployment configuration.
5. Choose and configure persistent services for MongoDB, document/selfie uploads, and vector-search data.
6. Recreate the backend test environment and make the automated suite pass.
7. Remove source-quality violations and add repeatable CI checks.
8. Complete manual acceptance testing in staging before production deployment.

## Manual acceptance gate (required before production)

- Login/logout with administrator, faculty, and student accounts.
- Create/update core records and confirm tenant isolation.
- Upload a supported document and review extraction/OCR results.
- Run attendance workflows, including a deliberate invalid upload and retry path.
- Generate and review a timetable, conflict, and substitute flow.
- Verify knowledge search/citations and graceful behavior without an AI-provider key.
- Confirm the frontend works from the deployed HTTPS domain and cannot call the API from an unauthorized origin.
- Restart the staging backend and confirm intended data persists.

The project must pass this gate with a human reviewer before production promotion.

## Phase 2 migration record

**Completed:** 2026-08-23

- The repository has been flattened: the workspace root is now the Git root, and the nested `CampusNova` directory no longer exists.
- Git history, branch (`main`), commit (`205e12d` at migration), remote (`origin`), tracked changes, and untracked source files were preserved. Git integrity verification completed successfully.
- The duplicate inner attendance PDF and PNG were removed only after SHA-256 verification against their identical root-level copies.
- Non-identical runtime/cache directories were preserved under `_migration_archive_2026-08-23/` for Phase 3 classification; they must not be committed or deployed.

## Phase 3 cleanup record

**Completed:** 2026-08-23

- Removed regenerated local artifacts: `frontend/.next`, `frontend/node_modules`, `backend/venv`, root and backend pytest caches, and the tracked `frontend/tsconfig.tsbuildinfo` build-info file.
- Preserved runtime databases, local uploads, test fixtures, sample documents, and README screenshots. All runtime data and migration archives are now excluded from Git and Docker build contexts.
- Replaced the minimal ignore files with deployment-safe rules covering secrets, generated dependencies/build output, local runtime state, personal uploads, test material, and migration archives.
- Repaired `scripts/comprehensive_reality_qa.py` so fixture paths derive from the project root instead of the former machine-specific nested `CampusNova` location.

## Phase 4 production-hardening record

**Completed:** 2026-08-23

- Removed the committed default JWT signing secret. Production startup now requires a hosting-managed `SECRET_KEY` of at least 32 characters.
- CORS now uses the explicit `CORS_ORIGINS` setting. Production rejects wildcard and localhost origins, while local development continues to allow the documented local frontend origins.
- Demo knowledge seeding is opt-in with `SEED_DEMO_DATA`; it is prohibited in production.
- Added explicit configuration for Mongo pool sizing, maximum upload size, upload storage, and Chroma persistence. New local defaults are under `backend/runtime/`, which is excluded from source control and Docker contexts.
- Added `/ready`, which returns HTTP 503 when MongoDB is unavailable, alongside the liveness `/health` endpoint.
- Hardened the API container to run as a non-root user, keep runtime state outside source code, and provide a Compose health check and named runtime volume.
- Added root, backend, and frontend environment templates plus `docs/production-configuration.md`.

## Remaining validation limitations

- Docker is not installed on this workstation, so image and Compose validation must run in CI or on the deployment host.
- The backend dependency installation did not complete in this environment, so the automated backend suite remains pending. The production configuration/token smoke test and Python compilation passed.

## Phase 5 staging preparation

**Completed:** 2026-08-23

- Added `render.yaml` for a Render staging API with a generated signing secret, health check, and persistent runtime disk.
- Added a minimal Vercel configuration in `frontend/` and a GitHub Actions workflow that validates backend tests and the frontend type-check/production build.
- Added `docs/staging-deployment.md`, which identifies the required account-holder provisioning steps and the mandatory human acceptance test gate.
