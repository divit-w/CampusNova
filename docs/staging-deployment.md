# Staging Deployment Handoff

This repository is prepared for a split deployment:

- **Frontend:** Vercel, with `frontend` set as the project root directory.
- **API:** Render, created from the root-level `render.yaml` Blueprint.
- **Database:** MongoDB Atlas (or another managed MongoDB provider), connected through `MONGO_URI`.

## Human actions required

These actions require the project owner's account access and must be completed before
an agent can validate staging:

1. Push the reviewed repository changes to the GitHub `main` branch.
2. Create a MongoDB staging database and create a least-privilege database user.
3. In Render, create a Blueprint from `render.yaml` and supply the prompted
   `MONGO_URI`, `CORS_ORIGINS`, AI provider keys, and `GOOGLE_CLIENT_ID` if Google
   login is enabled. Keep `SEED_DEMO_DATA=false`.
4. Copy the resulting API URL, such as `https://campusnova-api-staging.onrender.com`.
5. In Vercel, import the same repository with **Root Directory = `frontend`**.
6. Set `NEXT_PUBLIC_API_URL` to the exact Render API URL for the Vercel Preview and
   Production environments. Also set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` when Google login
   is enabled, then deploy the frontend.
7. Update Render `CORS_ORIGINS` to the exact Vercel staging URL, redeploy the API,
   and verify `GET /ready` returns HTTP 200.

Do not put secret values in GitHub, `render.yaml`, `vercel.json`, or any `.env.example` file.

## Staging verification

Automated checks should pass in GitHub Actions before human testing begins.

Then the human reviewer must complete these scenarios using the deployed Vercel URL:

1. Login and logout for each supported role.
2. Add or edit an administrative record and confirm data persists after an API restart.
3. Submit an attendance flow, including an invalid upload/retry case.
4. Upload and approve a document; verify OCR/extraction and its review state.
5. Upload a knowledge document, then confirm search returns grounded citations.
6. Create a timetable and inspect conflict/substitution behavior.
7. Confirm the frontend works from its HTTPS URL and an unrelated origin is denied by CORS.
8. Confirm `/health` and `/ready` return HTTP 200 after the API has restarted.

Record test results in the pull request or release notes. Production promotion is blocked
until every applicable scenario is accepted by a human reviewer.
