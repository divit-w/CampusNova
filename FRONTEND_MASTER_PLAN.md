# CampusNova Frontend — Master Plan

> **Purpose of this document.** This is the single source of truth for the CampusNova
> frontend build. It is written so the **backend author can verify every technical claim**
> (routes, payloads, status codes, auth mechanics) against the FastAPI source, and so a
> **non-technical stakeholder can verify every functional claim** (what each screen does,
> who can use it, what happens on success/failure).
>
> Every entry in the "Backend Contract Reference" section was read directly from the
> repository source and cites the file it came from. If a row is wrong, the backend has
> changed since this doc was written — fix the row before building against it.
>
> **Status:** Awaiting final approval (rev. 2 — incorporates senior architectural audit,
> see §5.5). No frontend code has been written yet. Build begins only on explicit confirmation.

---

## 1. Executive Summary

CampusNova is an AI-native school operations platform. The backend (FastAPI + MongoDB +
ChromaDB + Google OR-Tools + OpenRouter) is built and owned by the backend author. This
plan covers the **frontend only**, delivered in phases.

- **Phase 1 (this build):** the application shell + the **top 3 admin workflows**
  (NLP Command Center, Timetable Workspace, Substitute Resolution & live Alerts).
- **Phases 2–5:** everything else (dashboard, attendance, transport, knowledge/RAG,
  documents/OCR, role portals, hardening) — placeholder pages only in Phase 1.

**Critical finding to confirm (see §6):** all three Phase 1 workflow endpoints are guarded
by `require_roles(["admin"])`. Phase 1 is therefore effectively an **admin console**.
Teacher/student accounts can log in but will receive `403` on every Phase 1 feature.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14 (App Router) + TypeScript | Modern React, file routing, server/client split |
| Styling | Tailwind CSS | Utility-first, matches design tokens |
| Components | shadcn/ui (Radix primitives) | Accessible, unstyled base we theme |
| Data fetching | SWR | Caching, revalidation, polling for the timetable job |
| Motion | Framer Motion | Spring transitions, respects reduced-motion |
| Real-time | Native `EventSource` (SSE) | Matches backend `text/event-stream` |
| Icons | lucide-react | Consistent line icons |
| Sanitization | DOMPurify (only if HTML ever needed) | XSS mitigation for LLM output — see §5.5 P0-3 |
| Location | `frontend/` subfolder | Isolated from the Python `app/` package |

No state-management library — SWR cache + React context (auth, alerts) is sufficient for Phase 1.

---

## 3. Repository Layout

The Python backend owns the repo root (`app/`, `tests/`, `requirements.txt`, etc.).
The frontend is fully contained in `frontend/` so nothing collides:

```
/                      <- backend (unchanged)
  app/                 <- FastAPI package (backend author)
  requirements.txt
  FRONTEND_MASTER_PLAN.md   <- this file
  frontend/            <- NEW: Next.js app
    app/
      (auth)/login/page.tsx
      (app)/layout.tsx           <- guarded shell (sidebar + header + AlertProvider)
      (app)/page.tsx             <- minimal authenticated home
      (app)/assistant/page.tsx   <- NLP Command Center
      (app)/timetable/page.tsx   <- Timetable Workspace
      (app)/substitute/page.tsx  <- Substitute Resolution
      (app)/my-schedule/page.tsx <- Teacher read-only schedule (RBAC landing, see §5.5 P1-6)
      (app)/attendance/page.tsx  <- "Coming in Phase 2"
      (app)/transport/page.tsx   <- "Coming in Phase 2"
      layout.tsx                 <- root, fonts, <html class="bg-background">
      globals.css                <- design tokens
    lib/
      api.ts        <- typed fetch client (base URL, Bearer, error normalize)
      auth.tsx      <- AuthProvider, useAuth, route guard
      alerts.tsx    <- AlertProvider, useAlerts (EventSource + reconnect)
      types.ts      <- TS mirrors of backend schemas
    components/
      ui/           <- shadcn primitives
      sidebar.tsx, header.tsx, result-renderer.tsx, timetable-grid.tsx,
      connection-pill.tsx      <- fixed bottom-left SSE status pill (§5.5 P2-8)
      solver-progress.tsx      <- determinate fake-progress overlay (§5.5 P1-4)
      subject-color.ts         <- deterministic subject→semantic-color map (§5.5 P1-5)
    .env.local      <- NEXT_PUBLIC_API_URL
    package.json
```

---

## 4. Backend Contract Reference (VERIFIED against source)

> Backend author: this is the section to verify. Each row cites the source file. Base URL
> prefix for everything is `/api/v1` (from `app/main.py` `include_router` calls).

### 4.1 Global facts

| Fact | Value | Source |
|---|---|---|
| API title | `CampusNova API` | `app/main.py` |
| Health check | `GET /health` → `{"status":"ok",...}` | `app/main.py` |
| Router prefixes | `/api/v1/{auth,documents,timetable,alerts,knowledge,resources,attendance,erp,admin,portals,transport}` | `app/main.py` |
| CORS | `allow_origins=["*"]`, `allow_credentials=False`, all methods/headers | `app/main.py` |
| Max request body | 10 MB → `413` with `{"detail": "Payload Too Large..."}` | `ContentSizeLimitMiddleware` |
| Unhandled error | `500` → `{"message":"Internal Server Error"}` | `global_exception_handler` |
| Auth scheme | JWT Bearer; `sub` = user `id`, also carries `role` | `app/api/v1/deps.py`, `auth.py` |
| Token lifetime | `ACCESS_TOKEN_EXPIRE_MINUTES = 60*24*8` (8 days) | `app/core/config.py` |

Because `allow_credentials=False` and origins `*`, the browser will make requests fine using
a **Bearer header** (not cookies). Auth token must be sent as `Authorization: Bearer <token>`.

### 4.2 Auth — `app/api/v1/endpoints/auth.py`

| Endpoint | Method | Auth | Request | Success | Errors |
|---|---|---|---|---|---|
| `/api/v1/auth/login` | POST | none | **form-encoded** `username`, `password` (`application/x-www-form-urlencoded`) | `200 {access_token, token_type:"bearer"}` | `401` wrong creds |
| `/api/v1/auth/register` | POST | none | JSON `{email, password, full_name, role:"admin"\|"teacher"\|"student"}` | `200 UserResponse` | `409` email exists |
| `/api/v1/auth/me` | GET | Bearer | — | `200 {id, email, full_name, role}` | `401` invalid/expired |

> **Verify:** login is **OAuth2 form**, not JSON (`OAuth2PasswordRequestForm`). The field is
> `username`, and we will put the email in it. Confirm users log in with email-as-username.

### 4.3 Timetable — `app/api/v1/timetable.py`

| Endpoint | Method | Auth | Request | Success | Errors |
|---|---|---|---|---|---|
| `/api/v1/timetable/generate` | POST | **admin** | `TimetableConstraintPayload` (JSON) | `202 {job_id, status:"processing"}` | `422` payload invalid |
| `/api/v1/timetable/status/{job_id}` | GET | **admin** | — | `200 {job_id, status, result, error, created_at, completed_at}` | `404` unknown job; `422` when result status is `INFEASIBLE`/`MODEL_INVALID` |

**Async model (verify):** `/generate` returns immediately with a `job_id`; the CP-SAT solver
runs in a background thread (max 10s). The frontend **polls** `/status/{job_id}` until
`status` is `completed` or `failed`.

`TimetableConstraintPayload` (from `app/schemas/timetable.py`, `extra="forbid"` — no extra keys allowed):
```jsonc
{
  "days_per_week": 5,            // 1..7
  "periods_per_day": 6,          // 1..24
  "teachers":  [{ "id": "T1", "name": "…", "max_hours": 20 }],
  "rooms":     [{ "id": "R1", "capacity": 30 }],
  "subjects":  [{ "id": "S1", "name": "Math", "required_weekly_hours": 5 }],
  "cohorts":   [{ "id": "C1", "name": "Grade 6A", "student_count": 28 }],
  "hard_constraints": ["no_double_booking", "max_hours_respected"],
  "fixed_slots": [{ "subject_id":"S1","cohort_id":"C1","day":0,"period":0,"room_id":null }],
  "weight_faculty_gaps": 1.0,
  "weight_subject_spread": 2.0
}
```
Completed `result` shape (from `TimetableSolver.solve()`):
```jsonc
{
  "status": "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "MODEL_INVALID",
  "schedule": [
    { "teacher_id":"T1","cohort_id":"C1","room_id":"R1","subject_id":"S1","day":0,"period":0 }
  ]
}
```

> **Verify:** solver returns **no numeric score** — only a `status` string and the schedule
> array. Our "explainability" badges are derived on the frontend from `status`, from which
> `hard_constraints` were requested, and from `days×periods` occupancy. There is no soft-score
> value in the response to display. Confirm this is acceptable, or expose a score if you want one shown.

### 4.4 NLP / ERP — `app/api/v1/endpoints/erp.py`

| Endpoint | Method | Auth | Rate limit | Request | Success |
|---|---|---|---|---|---|
| `/api/v1/erp/prompt` | POST | **admin** | `10/minute` → `429` | `{ "query": "…" }` | `200 {action_type, target_collection, results}` |

`results` is `Union[List[dict], dict]` (from `app/schemas/erp.py`) — the shape is **not fixed**,
which is why the frontend uses a **generic adaptive renderer** (table for a list of objects,
key/value panel for a single object).

### 4.5 Substitute Resolution — `app/api/v1/endpoints/resources.py`

| Endpoint | Method | Auth | Request | Success | Errors |
|---|---|---|---|---|---|
| `/api/v1/resources/resolve-conflict` | POST | **admin** | `{absent_teacher_id, date, time_slot}` (all strings, `extra="forbid"`) | `200 {status:"success", substitute_teacher_id, message}` | `404` absent teacher not found; `409` no available substitutes |

Side effect (verify): on success the endpoint **broadcasts an SSE alert** to all connected
clients via `alert_manager.broadcast(...)`. So triggering a substitution should make a toast
appear in real time on any open session.

> **Verify (possible backend issue):** `resolve-conflict` queries teachers with
> `teachers_collection.find_one({"id": ...})` and `find({"id": {"$nin": ...}})`, but the
> startup index in `main.py` is created on `teacher_id` (unique). If teacher documents key
> their identifier as `teacher_id` rather than `id`, the absent-teacher lookup will 404 and no
> substitute will be found. Please confirm the teacher document uses an `id` field, or the demo
> will fail regardless of the frontend.

### 4.6 Alerts (SSE) — `app/api/v1/alerts.py`

| Endpoint | Method | Auth | Notes |
|---|---|---|---|
| `/api/v1/alerts/stream` | GET | **token via query string** `?token=<JWT>` | `text/event-stream` |

- Auth uses `get_current_user_ws(token: str = Query(...))` — the JWT is a **query param**, not a
  header (because the browser `EventSource` API cannot set headers). Verified in `deps.py`.
- Message frames: `data: {"type":"alert","message":"…"}` for real alerts, and every 5s a
  heartbeat `data: {"type":"heartbeat","status":"alive"}`.
- Frontend treats `heartbeat` as a liveness signal (drives the "Connected" indicator) and
  renders only `type:"alert"` frames as toasts.

---

## 5. Frontend Infrastructure Design

### 5.1 API client (`lib/api.ts`)
- Reads base URL from `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).
- Injects `Authorization: Bearer <token>` on every call.
- `login()` sends `application/x-www-form-urlencoded` with `username`/`password` (per §4.2).
- Normalizes errors into `{ status, detail }`; on `401` clears the session and redirects to `/login`.
- Surfaces `429` from the NLP endpoint as a friendly "slow down" message.

### 5.2 Auth & session (`lib/auth.tsx`)
- On login: POST form creds → store `access_token` (in-memory + `localStorage` for reload
  persistence) → call `/auth/me` → hydrate `{id,email,full_name,role}`.
- `AuthProvider` exposes `{user, token, login, logout, isLoading}`.
- Route guard: the `(app)` layout redirects to `/login` when no valid session.
- **Role awareness:** the UI reads `user.role`. Because Phase 1 features are admin-only, a
  non-admin sees the nav items disabled with an explanatory tooltip rather than hitting a 403.

### 5.3 Live alerts (`lib/alerts.tsx`)
- Opens `EventSource` to `/api/v1/alerts/stream?token=<JWT>` once authenticated.
- Reconnect with exponential backoff on error/close.
- Heartbeat within ~10s ⇒ status "Connected" (cyan); missed ⇒ "Reconnecting…".
- Dedupes identical consecutive alert messages; renders `type:"alert"` as a toast + keeps a
  small in-memory feed for the session.

### 5.4 SSE lifecycle (leak-safe implementation contract)
`lib/alerts.tsx` follows this exact pattern (audit P0-1):
- The `EventSource` instance is held in a `useRef` (not state) so re-renders never spawn duplicates.
- The reconnect timer id is held in a `useRef`.
- The connecting `useEffect` returns a cleanup that **both** calls `eventSource.close()` **and**
  `clearTimeout(reconnectTimerRef.current)`, so unmount/token-change never leaks a socket or timer.
- Reconnect uses exponential backoff; each new attempt closes any prior instance first.

### 5.5 Senior Architectural Audit — binding directives

These are **binding on the Phase 1 implementation**. Each is traceable to the code that satisfies it.

**P0 — correctness / resource safety**

| # | Directive | Where enforced | Acceptance check |
|---|---|---|---|
| P0-1 | SSE memory-leak prevention | `lib/alerts.tsx` (§5.4) | `EventSource` in `useRef`; `useEffect` cleanup calls `.close()` **and** clears reconnect timer |
| P0-2 | SWR polling stop condition | `(app)/timetable/page.tsx` | `refreshInterval: data?.status === "processing" ? 1000 : 0` — polling halts on terminal state |
| P0-3 | XSS mitigation on LLM output | `components/result-renderer.tsx` | All NLP text rendered via React `textContent` (JSX children); **no** `dangerouslySetInnerHTML`. DOMPurify only if HTML rendering is ever required |

> Note on P0-2: the backend job `status` values are `processing` → `completed`/`failed`
> (§4.3). The SWR key polls while `processing` and stops (interval `0`) once terminal. Confirm
> the exact in-progress string is `processing` so the stop condition matches.

**P1 / P2 — UX & live-demo polish**

| # | Directive | Where enforced | Behavior |
|---|---|---|---|
| P1-4 | Timetable solver progress (no generic spinner) | `components/solver-progress.tsx` | Determinate bar animates 0→90% over ~10s via CSS, **holds at 90%** until the poll resolves, then completes to 100%. Overlay shows live constraint params, e.g. "Solving for 5 days × 6 periods, 4 teachers, 6 subjects…" |
| P1-5 | Timetable grid hero UI | `components/timetable-grid.tsx` + `subject-color.ts` | Polished color-coded matrix; each subject gets a **consistent** semantic color (deterministic hash → fixed token palette), legible cells with teacher/room/cohort |
| P1-6 | Teacher Portal preview (prove RBAC) | `(app)/my-schedule/page.tsx` + guard | Non-admins are **actively routed** to a read-only Teacher Schedule view (not just blocked). Admins keep full nav. Demonstrates role routing works end-to-end |
| P2-7 | NLP 502 → specific state | `(app)/assistant/page.tsx` | `502` maps to a dedicated **"AI Service Temporarily Unavailable"** state (distinct from `429`/`403`/generic error) |
| P2-8 | SSE indicator placement | `components/connection-pill.tsx` | Live connection indicator is a **fixed bottom-left pill** (cyan "Connected" / amber "Reconnecting…"), present on every authenticated screen |

**Design & motion (non-negotiable, applies to all of the above):** strict light theme (white
app shell, `slate-50` workspaces), premium iOS/Telegram feel, **spring transitions on all layout
shifts**, shared easing tokens, subtle micro-animations, full `prefers-reduced-motion` fallback.
No blocky, static, or generic boilerplate styling. The P1-4 progress bar, P1-5 grid, and P2-8
pill must all animate with the shared easing system.

> **P1-6 open question for backend author:** the read-only Teacher Schedule needs a data source.
> There is **no** per-teacher schedule endpoint verified in Phase 1 (`/timetable/status/{job_id}`
> is admin-only and job-scoped). Options: (a) Phase 1 ships the Teacher Schedule as a **read-only
> UI shell** with a clear "no personal schedule endpoint yet" empty state, or (b) you expose a
> teacher-scoped read endpoint and we wire it live. Please pick (a) or (b).

## 6. Access / Role Model (functional, must-confirm)

| Workflow | Endpoint guard | Who can use it in Phase 1 |
|---|---|---|
| NLP Command Center | `require_roles(["admin"])` | **Admin only** |
| Timetable Workspace | `require_roles(["admin"])` | **Admin only** |
| Substitute Resolution | `require_roles(["admin"])` | **Admin only** |
| Alerts stream | any authenticated user | Any logged-in user |

**Implication:** Phase 1 ships an **admin console**. This is a deliberate scoping outcome, not
a frontend limitation. Teacher/student portals are Phase 4. Backend author: confirm this is the
intended Phase 1 audience.

**RBAC routing (audit P1-6):** rather than only blocking non-admins, the app **actively routes**
any non-admin to a read-only **Teacher Schedule** view (`/my-schedule`) on login, and admins to
the full workflow set. This proves role-based routing works end-to-end for the demo. The data
source for that view is the §5.5 open question (option a vs b).

---

## 7. Design System (functional + visual)

- **Theme:** strict **light mode only**. iOS / Telegram feel — clean white shell, `slate-50`
  workspace surfaces, `rounded-2xl` cards, soft shadows, hairline borders.
- **Motion:** restrained spring transitions (Framer Motion) with a full `prefers-reduced-motion`
  fallback (no motion for users who opt out).
- **Color tokens (max 5):** primary **blue** (brand/actions), **cyan** (live/connected),
  **green** (resolved/success), **amber** (warning), plus **slate** neutrals. Defined as
  semantic CSS variables in `globals.css`; no hard-coded `bg-white`/`text-black`.
- **Type:** max 2 families — one for headings, one for body; body line-height 1.4–1.6.
- **Layout:** mobile-first, flexbox-first; grid only for the timetable matrix.

---

## 8. Screen-by-Screen Functional Spec

### 8.1 Login (`/login`)
- Email + password form → `POST /auth/login` (form-encoded).
- On success store token, hydrate user, route to home. On `401` show inline "Incorrect
  username or password". Loading + disabled states while submitting.

### 8.2 App shell (`(app)/layout.tsx`)
- **3-state collapsible sidebar:** expanded (labels) / collapsed (icons + tooltips) / mobile
  slide-over. Nav: Home, Assistant, Timetable, Substitute, Attendance, Transport.
- **Header:** page title, user menu (name, role badge, logout).
- **Live connection indicator** is a **fixed bottom-left pill** (audit P2-8), not in the header —
  cyan "Connected" / amber "Reconnecting…", visible on every authenticated screen.
- Mounts `AlertProvider` so toasts work on every screen.

### 8.3 Home (`(app)/page.tsx`) — minimal
- Greeting + role badge, connection status, and quick-launch cards to the 3 workflows.
- (Rich KPI dashboard is Phase 2.)

### 8.4 NLP Command Center (`/assistant`)
- Prompt textarea + example-prompt chips + submit.
- `POST /erp/prompt {query}` → render `action_type` + `target_collection` as metadata badges,
  then the **adaptive renderer**:
  - `results` is a list of objects → responsive table (columns = union of keys).
  - `results` is a single object → key/value panel.
  - empty → friendly empty state.
- **All rendered text is sanitized** — output goes through React `textContent`/JSX children,
  never `dangerouslySetInnerHTML` (audit P0-3).
- Error states are distinct: `429` (rate-limit cooldown), `403` (non-admin), and
  **`502` → "AI Service Temporarily Unavailable"** (audit P2-7), plus a generic fallback.

### 8.5 Timetable Workspace (`/timetable`)
- **Constraint form** for `TimetableConstraintPayload`: days/periods steppers; editable lists
  for teachers/rooms/subjects/cohorts; hard-constraint toggles; optional fixed slots; soft-weight
  sliders. A **"Load sample"** button fills a known-feasible payload for demos.
- **Submit:** `POST /generate` → get `job_id` → poll `GET /status/{job_id}` via SWR with the
  **stop condition** `refreshInterval: data?.status === "processing" ? 1000 : 0` (audit P0-2) so
  polling halts the instant the job is terminal.
- **Loading state (audit P1-4):** a **determinate fake-progress bar** (CSS 0→90% over ~10s,
  holds at 90% until the poll resolves, then completes to 100%) — not a generic spinner. The
  overlay displays the live constraint parameters ("Solving for 5 days × 6 periods, N teachers…").
- **Output grid (audit P1-5):** day (columns) × period (rows) **color-coded matrix**; each
  subject is assigned a **consistent semantic color** (deterministic map), each cell shows
  subject/teacher/room/cohort from the `schedule` array. Polished, animated entrance with shared easing.
- **Explainability badges (frontend-derived, see §4.3 note):** solver `status`
  (OPTIMAL/FEASIBLE = green; INFEASIBLE/MODEL_INVALID = amber/red), which hard constraints were
  requested, and grid occupancy. `failed`/`422` shows a clear unsatisfiable explanation.

### 8.6 Substitute Resolution (`/substitute`)
- Form: `absent_teacher_id`, `date`, `time_slot`.
- `POST /resolve-conflict` → **ranked substitute result card** (`substitute_teacher_id`,
  success `message`). `404` → "absent teacher not found"; `409` → "no available substitutes".
- Because the backend broadcasts an SSE alert on success, a **toast** appears live confirming
  the assignment (good demo moment — open two sessions).

### 8.7 Teacher Schedule — read-only (`/my-schedule`, audit P1-6)
- Where non-admin users land after login (RBAC routing proof).
- Read-only, on-brand schedule view reusing the color-coded grid styling.
- Data source per §5.5 open question: option (a) polished read-only shell with a clear
  "no personal schedule endpoint yet" empty state, or (b) wired to a teacher-scoped endpoint if
  the backend author exposes one.

### 8.8 Phase 2 placeholders (`/attendance`, `/transport`)
- Static, on-brand "Coming in Phase 2" screens so routing/nav are complete. No data wiring.

---

## 9. Configuration & Environment

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` | FastAPI base URL (default `http://localhost:8000`) |

- No secrets in the frontend. The JWT is obtained at login and held client-side.
- Backend already permits browser calls (`CORS *`). For production, backend author may want to
  tighten `allow_origins` to the deployed frontend origin (currently `*`).

---

## 10. Preview / Runtime Note

v0's live preview runs a **single dev server** and expects the app at the repo root; since the
frontend lives in `frontend/`, the in-v0 preview may not auto-run it. It builds and runs locally
with:
```
cd frontend && npm install && npm run dev   # http://localhost:3000
```
Point `NEXT_PUBLIC_API_URL` at the running FastAPI instance (`uvicorn app.main:app --reload`).

---

## 11. Error & Edge-Case Matrix

| Case | Backend behavior | Frontend handling |
|---|---|---|
| Wrong login | `401` | Inline form error |
| Expired token (>8d) | `401` "Token expired" | Auto-logout → `/login` |
| Non-admin logs in | `403` on admin endpoints | Routed to read-only `/my-schedule` (P1-6); admin nav hidden |
| NLP over 10/min | `429` | Cooldown notice, retry hint |
| NLP AI provider down | `502` | Dedicated "AI Service Temporarily Unavailable" state (P2-7) |
| Timetable infeasible | `status:"failed"` or `422` | Amber "unsatisfiable" explanation |
| No substitute available | `409` | "No available substitutes" state |
| Absent teacher missing | `404` | "Teacher not found" (see §4.5 id/teacher_id note) |
| Body > 10 MB | `413` | Not expected in Phase 1 (no uploads) |
| SSE drop | stream closes | Backoff reconnect + "Reconnecting…" |
| Backend unreachable | network error | Non-blocking banner; screens show retry |

---

## 12. Full Phase Roadmap

| Phase | Scope | Backend modules used |
|---|---|---|
| **1 (this build)** | Shell, Auth, NLP Command Center, Timetable Workspace, Substitute + live Alerts; placeholders elsewhere | auth, erp, timetable, resources, alerts |
| **2** | Real dashboard/alert center, Attendance, Transport | attendance, transport, alerts history |
| **3** | Knowledge/RAG chat, Document intake + OCR review | knowledge, documents |
| **4** | Student / Teacher / Admin role portals | portals, admin |
| **5** | A11y pass, performance, resilience, security headers/CSP, deploy | — |

---

## 13. Verification Checklist for the Backend Author

Please confirm each item; a ❌ means the frontend must adapt or the backend must change.

- [ ] Login is OAuth2 **form-encoded** with field `username` holding the user's email.
- [ ] All three Phase-1 workflow endpoints are **admin-only** (intended audience).
- [ ] Timetable `/status` returns `result.status` + `result.schedule` and **no numeric score**.
- [ ] Substitute lookups use an `id` field on teacher docs (not `teacher_id`) — see §4.5.
- [ ] `resolve-conflict` broadcasts an SSE alert on success (drives the live toast demo).
- [ ] Alerts stream authenticates via `?token=<JWT>` query param.
- [ ] For a hosted demo, what origin should CORS allow (currently `*`)?
- [ ] Is there seed data (an admin user + teachers/cohorts) available for the demo, or should
      we script `POST /auth/register` + inserts?
- [ ] Timetable in-progress `status` string is exactly `"processing"` (drives SWR stop condition P0-2).
- [ ] NLP endpoint can surface a `502` (AI provider down) that we map to a dedicated state (P2-7).
- [ ] Teacher Schedule data source (§5.5 P1-6): option **(a)** read-only shell, or **(b)** you
      expose a teacher-scoped read endpoint — which one?

### 13.1 Audit directives — implementation sign-off (rev. 2)

Confirm the frontend will satisfy each (all are already committed in §5.5):

- [ ] P0-1 SSE `EventSource` in `useRef` with cleanup closing socket + clearing reconnect timer.
- [ ] P0-2 SWR timetable polling stops via `refreshInterval` terminal condition.
- [ ] P0-3 No `dangerouslySetInnerHTML` for LLM output; sanitized rendering only.
- [ ] P1-4 Determinate fake-progress overlay (0→90% hold) with constraint params, no generic spinner.
- [ ] P1-5 Color-coded timetable matrix with consistent per-subject semantic colors.
- [ ] P1-6 Non-admins routed to read-only Teacher Schedule (RBAC proof).
- [ ] P2-7 NLP `502` → "AI Service Temporarily Unavailable".
- [ ] P2-8 SSE connection indicator as fixed bottom-left pill.
- [ ] Design/motion: strict light theme, iOS/Telegram feel, spring transitions, reduced-motion fallback.

---

*End of master plan (rev. 2). On explicit approval, Phase 1 begins with the app shell (Next.js
setup, design system, auth/login, collapsible sidebar), then the three workflows in order — each
satisfying the §5.5 audit directives — the read-only Teacher Schedule (P1-6), then the Phase 2
placeholder pages. No code will be written before that approval.*
