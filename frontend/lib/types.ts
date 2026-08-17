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
  // UX Fields for Advanced Timetable Engine (Ignored by current Python solver)
  blocked_periods?: { day: number; period: number }[]
  required_rooms?: string[]
  morning_bias?: boolean
  consecutive_free_periods?: boolean
  avoid_fridays?: boolean
}
export interface TimetableRoom {
  id: string
  capacity: number
}
export interface TimetableSubject {
  id: string
  name: string
  required_weekly_hours: number
  qualified_teachers?: string[]

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

/* Convenience aliases used across the timetable UI. */
export type TimetablePayload = TimetableConstraintPayload
export type TimetableResult = SolverResult
export type TimetableStatusResponse = TimetableJob

/* ── NLP / ERP — app/schemas/erp.py ─────────────────────────────────── */

export interface PromptResponse {
  action_type: string
  target_collection: string
  results: Record<string, unknown>[] | Record<string, unknown>
  summary?: string
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
  /** ML ranking score: subject expertise match (0–1). Used to render the "X% Match" badge. */
  subject_compatibility_score: number
  /** Composite suitability score from PredictiveAllocator (0–1). */
  suitability_score: number
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

/* ── Attendance — app/api/v1/endpoints/attendance.py + admin_erp.py ──── */

export interface ExtractedAttendanceRecord {
  student_id: string
  name: string
  status: "present" | "absent" | "on_leave"
}

export interface ValidationResult {
  passed: boolean
  code: string
  message: string
  severity: "INFO" | "WARNING" | "POLICY_FLAG" | "CRITICAL"
}

export interface ProcessedAttendanceRow {
  row_id: string
  student_id?: string
  student_name?: string
  status?: string
  validations: Record<string, ValidationResult>
  decision: "VALID" | "REVIEW" | "EXCEPTION"
  decision_reason?: string
}

export interface BulkAttendanceResponse {
  batch_id: string
  date?: string
  class_section?: string
  total_rows: number
  valid_rows: number
  review_rows: number
  exception_rows: number
  records: ProcessedAttendanceRow[]
  overall_decision: "AUTO" | "REVIEW" | "EXCEPTION"
  decision_reason?: string
}

export interface FinalizeBulkAttendanceRequest {
  batch_id: string
  date: string
  class_section: string
  records: ProcessedAttendanceRow[]
}

/** POST /attendance/process-sheet */
export interface ProcessSheetResponse {
  status: string
  message: string
  processed_count: number
  records: ExtractedAttendanceRecord[]
  date: string
}

export interface SyncBulkRequest {
  date: string
  records: ExtractedAttendanceRecord[]
}

export interface SyncBulkResponse {
  status: string
  message: string
  processed_count: number
}

/** POST /attendance/faculty-clock-in */
export interface ClockInResponse {
  status: string
  message: string
}

/** GET /admin/attendance/summary — per-student present/absent counts for one date. */
export interface AttendanceStudentRecord {
  student_id: string
  total: number
  present: number
  absent: number
  excused?: number
  leave?: number
}
export interface AttendanceSummaryResponse {
  date: string
  total_students: number
  records: AttendanceStudentRecord[]
}

/** app/schemas/core_erp.py :: StudentResponse (roster row) */
export interface StudentRecord {
  student_id: string
  full_name: string
  grade: string
  section: string
  email: string
}

/** GET /portals/student/attendance-summary — app/schemas/attendance.py :: StudentAttendanceSummaryResponse */
export interface StudentAttendanceSummaryResponse {
  student_id: string
  total: number
  present: number
  absent: number
  percentage: number
}

/* ── Knowledge / RAG — app/schemas/knowledge.py ─────────────────────── */

export interface RAGCitation {
  document_id: string
  chunk_index: number
  confidence_score: number
  extracted_text: string
}

/** POST /knowledge/query */
export interface RAGResponse {
  query: string
  answer: string
  citations: RAGCitation[]
}

/** POST /knowledge/upload */
export interface KnowledgeUploadResponse {
  message: string
  document_id: string
  total_chunks: number
}

/* ── Document intake / OCR — app/schemas/documents.py ───────────────── */

export interface ExtractedField {
  key: string
  value: string
  confidence: string
}


export interface ExtractedDocument {
  document_category: string
  summary: string
  extracted_fields: ExtractedField[]
  student_name?: string
  student_id?: string
  leave_start_date?: string
  leave_end_date?: string
  leave_type?: string
  requires_human_review: boolean
  student_verified?: boolean
  matched_student_class?: string
  validations?: Record<string, ValidationResult>
  decision?: "AUTO" | "REVIEW" | "EXCEPTION"
  decision_reason?: string
}

/** POST /documents/extract */
export interface DocumentExtractResponse extends ExtractedDocument {
  document_id: string
}

/* ── Transport — app/schemas/transport.py ───────────────────────────── */

export interface VehicleSpec {
  vehicle_id: string
  capacity: number
  /** [latitude, longitude] */
  start_location: [number, number]
}

export interface TransportOptimizationRequest {
  vehicles: VehicleSpec[]
}

export interface RouteStop {
  stop_order: number
  student_ids: string[]
  location: [number, number]
}

export interface OptimizedRoute {
  vehicle_id: string
  assigned_student_count: number
  estimated_distance_km: number
  estimated_duration_min: number
  stops: RouteStop[]
}

export interface TransportOptimizationResponse {
  total_vehicles_used: number
  total_students_routed: number
  routes: OptimizedRoute[]
}

/** GET /transport/routes-summary — app/schemas/transport.py :: TransportRoutesSummaryResponse */
export interface TransportRoutesSummaryResponse {
  has_plan: boolean
  active_routes: number
  total_students_routed: number
  generated_at: string | null
}

/* ── Dashboard — app/schemas/dashboard.py ───────────────────────────── */

export interface DailyAttendancePoint {
  date: string
  present: number
  absent: number
  total: number
}

/** GET /admin/dashboard-summary — app/schemas/dashboard.py :: DashboardSummaryResponse */
export interface DashboardSummaryResponse {
  active_students: number
  active_teachers: number
  timetable_status: JobStatus | null
  timetable_generated_at: string | null
  substitutions_today: number
  weekly_attendance: DailyAttendancePoint[]
}
