# Production Configuration

CampusNova is deployed as two services: a Next.js frontend and a FastAPI backend.
The frontend may be hosted separately, but it must be built with the final backend
URL in `NEXT_PUBLIC_API_URL`.

## Backend required secrets

Set these through the hosting provider; do not place production values in Git.

| Variable | Production requirement |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `SECRET_KEY` | Unique, stable random secret with at least 32 characters |
| `MONGO_URI` | Managed MongoDB connection string with TLS enabled |
| `MONGO_DB_NAME` | Production database name |
| `CORS_ORIGINS` | Exact public frontend origin, for example `https://app.example.com` |
| `OPENROUTER_API_KEY` | Required if AI extraction/search features are enabled |
| `CHROMA_PERSIST_DIR` | Persistent mounted storage path, or replace local Chroma with a managed vector service |
| `UPLOADS_DIR` | Persistent storage path; object storage is recommended for real user uploads |

Set `SEED_DEMO_DATA=false`. Demo accounts and seeded documents must never be
automatically initialized in production.

## Frontend environment

Set this at frontend build time:

```text
NEXT_PUBLIC_API_URL=https://api.example.com
```

Public `NEXT_PUBLIC_*` values are visible in the browser, so do not put credentials
or private API keys in them.

## Deployment checks

1. `GET /health` must return HTTP 200.
2. `GET /ready` must return HTTP 200 only after MongoDB is reachable.
3. Verify preflight requests from the real frontend origin succeed.
4. Verify preflight requests from an unrelated origin are rejected.
5. Confirm data persists after restarting the backend.

## Manual acceptance gate

Before production promotion, a human reviewer must complete the checklist in
`docs/deployment-readiness-audit.md` against staging.
