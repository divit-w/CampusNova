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
  university_id?: string
  university_name?: string | null
  is_demo?: boolean
  is_setup_complete?: boolean
}

export interface Institution {
  university_id: string
  university_name?: string | null
  created_by?: string
  created_at?: string
  is_setup_complete?: boolean
  is_demo?: boolean
}

/** app/schemas/auth.py :: Token */
export interface Token {
  access_token: string
  token_type: string
}

/* ── Timetable — app/schemas/timetable.py ───────────────────────────── */

export type HardConstraint =
  | "no_double_booking"
  | "max_hours_respected"
  | "qualified_faculty_only"
  | "room_capacity_respected"
  | "blocked_slots_respected"

export interface TimeSlot {
  day: number
  period: number
}

export interface TimetableTeacher {
  id: string
  name: string
  max_hours: number
  blocked_slots?: TimeSlot[]
  blocked_periods?: TimeSlot[] // legacy compatibility
  required_rooms?: string[]
  morning_bias?: boolean
  consecutive_free_periods?: boolean
  avoid_fridays?: boolean
}

export interface TimetableRoom {
  id: string
  name?: string
  capacity: number
  room_type?: string
}

export interface TimetableSubject {
  id: string
  name: string
  room_type?: string
  required_weekly_hours?: number
  qualified_teachers?: string[]
}

export interface TimetableCohort {
  id: string
  name: string
  student_count: number
  blocked_slots?: TimeSlot[]
}

export interface CourseOffering {
  id: string
  cohort_id: string
  subject_id: string
  required_weekly_hours: number
  qualified_teacher_ids: string[]
  allowed_room_ids?: string[]
}

export interface FixedSlotRequirement {
  offering_id?: string
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
  course_offerings?: CourseOffering[]
  hard_constraints: HardConstraint[]
  fixed_slots: FixedSlotRequirement[]
  weight_faculty_gaps: number
  weight_subject_spread: number
}

/** Each entry produced by the CP-SAT solver. */
export interface ScheduleEntry {
  offering_id?: string
  teacher_id: string
  cohort_id: string
  room_id: string
  subject_id: string
  day: number
  period: number
}

export type ConflictType =
  | "teacher_double_booking"
  | "room_double_booking"
  | "cohort_double_booking"
  | "teacher_blocked"
  | "cohort_blocked"
  | "capacity_exceeded"
  | "unqualified_teacher"

export interface DetectedConflict {
  id: string
  type: ConflictType
  severity: "critical" | "warning"
  day: number
  period: number
  cohort_id?: string
  teacher_id?: string
  room_id?: string
  subject_id?: string
  title: string
  description: string
  affected_entry_indices: number[]
}

/** solver result: { status, schedule } */
export interface SolverResult {
  status: string // OPTIMAL | FEASIBLE | INFEASIBLE | MODEL_INVALID
  schedule: ScheduleEntry[]
  solve_time_ms?: number
}

export type JobStatus = "processing" | "completed" | "failed" | "active" | "draft"

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

export interface ActiveTimetableResponse {
  is_active: boolean
  status: string
  job_id?: string
  schedule: ScheduleEntry[]
  payload?: TimetableConstraintPayload
  solve_time_ms?: number
  activated_at?: string
  activated_by?: string
  total_slots_scheduled: number
}

export interface ActivateTimetableRequest {
  job_id?: string
  schedule?: ScheduleEntry[]
  payload?: TimetableConstraintPayload
}

export interface ValidateTimetableResponse {
  is_valid: boolean
  hard_conflicts_count: number
  conflicts: DetectedConflict[]
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
  intent?: "query" | "action" | "conversational" | "clarification" | string
  total_matches?: number
  preview_count?: number
  preview_limit?: number
  route?: string
  suggested_action?: string
  action_card?: {
    title: string
    detail?: string
    faculty_name?: string
    faculty_id?: string
    route: string
    action_label: string
  }
}

export interface ResourceConflictRequest {
  absent_teacher_id: string
  date: string
  time_slot: string
  selected_substitute_id?: string
}

export interface SubstituteCandidate {
  teacher_id: string
  full_name: string
  subject: string
  subject_compatibility_score: number
  suitability_score: number
  total_historical_substitutions?: number
}

export interface AffectedClassSlot {
  time_slot: string
  period_label: string
  cohort: string
  subject: string
  subject_code?: string | null
  room: string
  room_capacity?: number | null
  student_count?: number | null
  assigned_substitute_id?: string | null
  assigned_substitute_name?: string | null
}

export interface FacultyScheduleResponse {
  teacher_id: string
  full_name: string
  subject: string
  date: string
  day_name: string
  affected_classes: AffectedClassSlot[]
}

export interface ResolveConflictResponse {
  status: string
  substitute_teacher_id: string
  message: string
  /** ML ranking score: subject expertise match (0–1). Used to render the "X% Match" badge. */
  subject_compatibility_score: number
  /** Composite suitability score from PredictiveAllocator (0–1). */
  suitability_score: number
  ranked_candidates?: SubstituteCandidate[]
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
  record_id?: string
}

export interface FacultyAttendanceRecord {
  teacher_id: string
  full_name: string
  subject: string
  status: "present" | "absent" | "on_leave" | "unmarked" | "not_scheduled"
  clock_in_time: string | null
  date: string
  location_verified: boolean
  distance_meters: number | null
  liveness_verified: boolean
  record_id: string | null
  proof_url: string | null
}

export interface FacultyAttendanceSummaryResponse {
  date: string
  is_working_day?: boolean
  total_faculty: number
  present_count: number
  absent_count: number
  excused_count?: number
  unmarked_count?: number
  records: FacultyAttendanceRecord[]
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
  is_working_day?: boolean
  total_students: number
  roster_total?: number
  present?: number
  absent?: number
  excused?: number
  unmarked?: number
  records: AttendanceStudentRecord[]
}

/* ── Brick 3: Session Attendance & Daily Schedule Interfaces ─────────── */

export interface SessionRosterStudent {
  student_id: string
  student_name: string
  roll_number?: string | null
  email?: string | null
  status: "present" | "absent" | "excused" | "unmarked"
  marked_at?: string | null
  marked_by?: string | null
  source?: string | null
}

export interface SessionRosterResponse {
  date: string
  cohort_id: string
  cohort_name: string
  subject_id: string
  subject_name: string
  faculty_id: string
  faculty_name: string
  period: string
  is_scheduled: boolean
  room?: string | null
  students: SessionRosterStudent[]
  is_already_recorded: boolean
}

export interface SessionStudentItem {
  student_id: string
  status: "present" | "absent" | "excused" | "unmarked"
}

export interface RecordSessionAttendanceRequest {
  date: string
  cohort_id: string
  subject_id: string
  faculty_id: string
  period: string
  records: SessionStudentItem[]
}

export interface ScheduledSessionInfo {
  period: string
  time_slot?: string | null
  cohort_id: string
  cohort_name?: string | null
  subject_id: string
  subject_name?: string | null
  faculty_id: string
  faculty_name?: string | null
  room?: string | null
  is_recorded: boolean
  recorded_at?: string | null
  total_students: number
  present_count: number
  absent_count: number
  excused_count: number
}

export interface DailySessionStatusResponse {
  date: string
  is_working_day: boolean
  status_message: string
  total_scheduled_sessions: number
  recorded_sessions: number
  scheduled_sessions: ScheduledSessionInfo[]
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
  source_file?: string
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
  raw_value?: string
  confidence_score?: number
  status?: string
}

export interface CandidateMatch {
  id: string
  name: string
  score: number
  cohort?: string
  subject?: string
}

export interface ExtractedDocument {
  document_type?: string
  document_category: string
  classification_confidence?: number
  classification_reason?: string
  summary: string
  extracted_fields: ExtractedField[]
  raw_ocr_text?: string
  preprocessing_meta?: {
    upscaled?: boolean
    original_dimensions?: [number, number]
    processed_dimensions?: [number, number]
    deskew_angle?: number
    contrast_enhanced?: boolean
    denoised?: boolean
    stroke_preserved?: boolean
  }
  student_name?: string
  student_id?: string
  raw_student_name?: string
  suggested_student_name?: string
  student_name_confidence?: number
  student_candidates?: CandidateMatch[]
  leave_start_date?: string
  leave_end_date?: string
  raw_leave_start_date?: string
  raw_leave_end_date?: string
  leave_start_status?: string
  leave_end_status?: string
  leave_start_confidence?: number
  leave_end_confidence?: number
  leave_type?: string
  leave_reason?: string
  faculty_name?: string
  faculty_id?: string
  raw_faculty_name?: string
  suggested_faculty_name?: string
  faculty_name_confidence?: number
  faculty_candidates?: CandidateMatch[]
  faculty_verified?: boolean
  affected_classes?: Array<{
    period: string
    time: string
    cohort: string
    subject: string
    room: string
    faculty_id?: string
    faculty_name?: string
  }>
  applicant_name?: string
  applicant_program?: string
  applicant_email?: string
  applicant_phone?: string
  parent_name?: string
  application_number?: string
  receipt_number?: string
  fee_amount?: string
  payment_date?: string
  fee_type?: string
  semester?: string
  cgpa?: string
  recommended_action?: string
  recommended_action_description?: string
  operational_route?: string
  operational_effect?: Record<string, any>
  requires_human_review: boolean
  student_verified?: boolean
  matched_student_class?: string
  target_department?: string
  policy_alert?: string
  validations?: Record<string, ValidationResult>
  decision?: "AUTO" | "REVIEW" | "EXCEPTION"
  decision_reason?: string
  needs_review_fields?: string[]
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
  road_geometry?: [number, number][]
  road_routing_status?: "success" | "unavailable"
  road_distance_km?: number
  road_duration_min?: number
}

export interface TransportOptimizationResponse {
  total_vehicles_used: number
  total_students_routed: number
  total_unassigned?: number
  unassigned_students?: string[]
  routes: OptimizedRoute[]
}

/** GET /transport/routes-summary — app/schemas/transport.py :: TransportRoutesSummaryResponse */
export interface TransportRoutesSummaryResponse {
  has_plan: boolean
  active_routes: number
  total_students_routed: number
  total_unassigned?: number
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

/* ── University Settings & Directory Entities ───────────────────────── */

export interface UniversityProfile {
  university_id: string
  university_name: string | null
  name?: string | null
  short_name?: string | null
  academic_year?: string
  working_days_per_week?: number
  periods_per_day?: number
  period_duration_minutes?: number
  start_time?: string
  is_setup_complete: boolean
  is_demo: boolean
  stats?: {
    students: number
    teachers: number
    classes: number
    subjects: number
    rooms: number
    has_active_timetable: boolean
  }
}

export interface UniversityUpdateRequestPayload {
  university_name?: string
  name?: string
  short_name?: string
  academic_year?: string
  working_days_per_week?: number
  periods_per_day?: number
  period_duration_minutes?: number
  start_time?: string
  is_setup_complete?: boolean
}

export interface TeacherRecord {
  teacher_id: string
  full_name: string
  name?: string
  email?: string
  department?: string
  subjects: string[]
  max_hours?: number
  status?: string
  blocked_slots?: TimeSlot[] | string[]
}

export interface StudentRecordFull {
  student_id: string
  full_name: string
  name?: string
  email?: string
  grade?: string
  section?: string
  cohort_id?: string | null
  class_id?: string | null
  department?: string
  enrollment_no?: string
  status?: string
}

export interface CohortRecord {
  class_id: string
  cohort_id?: string | null
  name?: string | null
  department?: string
  grade?: string
  section?: string
  capacity?: number
  student_count?: number
  teacher_id?: string
  subject?: string
  schedule_time?: string
  status?: string
}

export interface SubjectRecord {
  subject_id: string
  id?: string
  name: string
  code?: string
  department?: string
  credits?: number
  required_weekly_hours?: number
  room_type?: string
  eligible_teachers?: string[]
  assigned_cohorts?: string[]
  status?: string
}

export interface RoomRecord {
  room_id: string
  id?: string
  name?: string | null
  room_type?: string
  capacity?: number
  facilities?: string[]
  status?: string
}

export interface TimetableEntitiesResponse {
  university_id: string
  counts: {
    teachers: number
    cohorts: number
    subjects: number
    rooms: number
  }
  teachers: TeacherRecord[]
  cohorts: CohortRecord[]
  subjects: SubjectRecord[]
  rooms: RoomRecord[]
  settings: {
    working_days: number
    periods_per_day: number
    academic_year?: string
    start_time?: string
  }
  ready_to_generate: boolean
  missing_requirements: string[]
}

export interface OperationalAlert {
  alert_id: string
  university_id: string
  type: string
  title: string
  message: string
  severity: "info" | "warning" | "error" | "critical"
  status: "active" | "resolved"
  route?: string
  created_at: string
  resolved_at?: string
}
