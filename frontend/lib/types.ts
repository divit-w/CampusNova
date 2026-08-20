/**
 * Frontend mirrors of the backend Pydantic schemas.
 * Source of truth: app/schemas/*.py  (verified against backend on build).
 */

export type Role = "admin" | "teacher" | "student"

/** app/schemas/auth.py :: UserResponse */
export interface User {
  id: string
  email: string
  full_name: string
  role: Role
}

/** app/schemas/auth.py :: Token */
export interface Token {
  access_token: string
  token_type: string
}

/* ── Timetable — app/schemas/timetable.py ───────────────────────────── */

export type HardConstraint = "no_double_booking" | "max_hours_respected"

export interface TimetableTeacher {
  id: string
  name: string
  max_hours: number
}
export interface TimetableRoom {
  id: string
  capacity: number
}
export interface TimetableSubject {
  id: string
  name: string
  required_weekly_hours: number
}
export interface TimetableCohort {
  id: string
  name: string
  student_count: number
}
export interface FixedSlotRequirement {
  subject_id: string
  cohort_id: string
  day: number
  period: number
  room_id?: string | null
}

export interface TimetableConstraintPayload {
  days_per_week: number
  periods_per_day: number
  teachers: TimetableTeacher[]
  rooms: TimetableRoom[]
  subjects: TimetableSubject[]
  cohorts: TimetableCohort[]
  hard_constraints: HardConstraint[]
  fixed_slots: FixedSlotRequirement[]
  weight_faculty_gaps: number
  weight_subject_spread: number
}

/** Each entry produced by the CP-SAT solver. */
export interface ScheduleEntry {
  teacher_id: string
  cohort_id: string
  room_id: string
  subject_id: string
  day: number
  period: number
}

/** solver result: { status, schedule } */
export interface SolverResult {
  status: string // OPTIMAL | FEASIBLE | INFEASIBLE | MODEL_INVALID
  schedule: ScheduleEntry[]
}

export type JobStatus = "processing" | "completed" | "failed"

/** GET /timetable/status/{job_id} */
export interface TimetableJob {
  job_id: string
  status: JobStatus
  result: SolverResult | null
  error: string | null
  created_at?: string | null
  completed_at?: string | null
}

/** POST /timetable/generate → 202 */
export interface GenerateJobAck {
  job_id: string
  status: JobStatus
}

/* ── NLP / ERP — app/schemas/erp.py ─────────────────────────────────── */

export interface PromptResponse {
  action_type: string
  target_collection: string
  results: Record<string, unknown>[] | Record<string, unknown>
}

/* ── Substitute — app/schemas/resources.py ──────────────────────────── */

export interface ResourceConflictRequest {
  absent_teacher_id: string
  date: string
  time_slot: string
}

export interface ResolveConflictResponse {
  status: string
  substitute_teacher_id: string
  message: string
}

/* ── Portals — app/schemas/core_erp.py :: ClassResponse ─────────────── */

export interface ClassResponse {
  class_id: string
  teacher_id: string
  subject: string
  schedule_time: string
  grade: string
  section: string
}

/* ── Alerts (SSE) — app/api/v1/alerts.py ────────────────────────────── */

export interface AlertEvent {
  type: "alert" | "heartbeat"
  message: string
}

export interface FeedAlert {
  id: string
  message: string
  receivedAt: number
}
