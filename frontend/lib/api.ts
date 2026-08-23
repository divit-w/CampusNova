import { API_V1, TOKEN_STORAGE_KEY } from "./config"
import type {
  AttendanceSummaryResponse,
  ClassResponse,
  ClockInResponse,
  FacultyAttendanceRecord,
  FacultyAttendanceSummaryResponse,
  DocumentExtractResponse,
  BulkAttendanceResponse,
  FinalizeBulkAttendanceRequest,
  GenerateJobAck,
  KnowledgeUploadResponse,
  ProcessSheetResponse,
  PromptResponse,
  RAGResponse,
  ResolveConflictResponse,
  ResourceConflictRequest,
  DashboardSummaryResponse,
  StudentAttendanceSummaryResponse,
  StudentRecord,
  TimetableConstraintPayload,
  TimetableJob,
  Token,
  TransportOptimizationRequest,
  TransportOptimizationResponse,
  TransportRoutesSummaryResponse,
  User,
  ExtractedAttendanceRecord,
  SyncBulkResponse,
  ActiveTimetableResponse,
  ActivateTimetableRequest,
  ValidateTimetableResponse,
  UniversityProfile,
  DailySessionStatusResponse,
  SessionRosterResponse,
  RecordSessionAttendanceRequest,
} from "./types"

/** Normalized error that carries the HTTP status so UI can branch on 401/403/413/429/502. */
export class ApiError extends Error {
  status: number
  detail: string
  constructor(status: number, detail: string) {
    super(detail)
    this.name = "ApiError"
    this.status = status
    this.detail = detail
  }
}

/* ── token helpers (client-side session) ────────────────────────────── */

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(TOKEN_STORAGE_KEY)
}
export function setToken(token: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
}
export function clearToken() {
  if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_STORAGE_KEY)
}

/* ── core request helper ────────────────────────────────────────────── */

async function extractDetail(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.detail === "string") return data.detail
    if (Array.isArray(data?.detail)) return data.detail.map((d: any) => d?.msg).filter(Boolean).join("; ")
    if (typeof data?.detail === "object" && typeof data?.detail?.message === "string") return data.detail.message
    if (typeof data?.message === "string") return data.message
    return res.statusText || "Request failed"
  } catch {
    return res.statusText || "Request failed"
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** send as application/x-www-form-urlencoded (OAuth2 login) */
  form?: Record<string, string>
  /** send as multipart/form-data (file uploads) — browser sets the boundary header */
  formData?: FormData
  auth?: boolean
  signal?: AbortSignal
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, form, formData, auth = true, signal } = opts
  const headers: Record<string, string> = {}

  if (auth) {
    const token = getToken()
    if (token) headers["Authorization"] = `Bearer ${token}`
  }

  let payload: BodyInit | undefined
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded"
    payload = new URLSearchParams(form).toString()
  } else if (formData) {
    // Do NOT set Content-Type — the browser fills in the multipart boundary.
    payload = formData
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json"
    payload = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(`${API_V1}${path}`, { method, headers, body: payload, signal })
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw new ApiError(504, "Request timed out. The server took too long to respond.")
    // network / CORS / backend unreachable
    throw new ApiError(0, "Cannot reach the CampusNova backend. Check that the API is running and NEXT_PUBLIC_API_URL is correct.")
  }

  // Auto-logout on expired/invalid session (except the login call itself).
  if (res.status === 401 && auth) {
    clearToken()
  }

  if (!res.ok) {
    // 413: Payload Too Large — render polished message, not a raw crash.
    // 429: Rate Limited — already handled in ErrorState.
    // 502/503/504: Upstream AI unavailable — handled in ErrorState.
    throw new ApiError(res.status, await extractDetail(res))
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/* ── typed endpoints ────────────────────────────────────────────────── */

export const api = {
  /** Generic helpers used by the workflow pages (SWR fetchers, mutations). */
  get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return request<T>(path, { signal })
  },
  post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>(path, { method: "POST", body, signal })
  },
  put<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>(path, { method: "PUT", body, signal })
  },
  patch<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>(path, { method: "PATCH", body, signal })
  },
  delete<T>(path: string, signal?: AbortSignal): Promise<T> {
    return request<T>(path, { method: "DELETE", signal })
  },

  /** OAuth2 password flow — form-encoded username/password. */
  async login(email: string, password: string): Promise<Token> {
    return request<Token>("/auth/login", {
      method: "POST",
      auth: false,
      form: { username: email, password },
    })
  },

  /** Google Identity Login flow. */
  async loginWithGoogle(credential: string): Promise<Token> {
    return request<Token>("/auth/google", {
      method: "POST",
      auth: false,
      body: { credential },
    })
  },

  async me(): Promise<User> {
    return request<User>("/auth/me")
  },

  /* University Management (admin) */
  async getUniversity(): Promise<UniversityProfile> {
    return request<UniversityProfile>("/admin/university")
  },

  async updateUniversity(body: Partial<UniversityProfile> | string): Promise<UniversityProfile> {
    const payload = typeof body === "string" ? { university_name: body } : body
    return request<UniversityProfile>("/admin/university", {
      method: "PATCH",
      body: payload,
    })
  },

  async quickStartUniversity(): Promise<{ status: string; message: string; dataset: any }> {
    return request("/admin/setup/quick-start", {
      method: "POST",
    })
  },

  /* NLP command center (admin) */
  async prompt(query: string, signal?: AbortSignal): Promise<PromptResponse> {
    return request<PromptResponse>("/erp/prompt", { method: "POST", body: { query }, signal })
  },

  /* Timetable (admin) */
  async generateTimetable(payload: TimetableConstraintPayload): Promise<GenerateJobAck> {
    return request<GenerateJobAck>("/timetable/generate", { method: "POST", body: payload })
  },
  async optimizeTimetable(payload: TimetableConstraintPayload): Promise<GenerateJobAck> {
    return this.generateTimetable(payload)
  },
  async timetableStatus(jobId: string): Promise<TimetableJob> {
    return request<TimetableJob>(`/timetable/status/${jobId}`)
  },

  /* Substitute resolution (admin) */
  async resolveConflict(body: ResourceConflictRequest): Promise<ResolveConflictResponse> {
    return request<ResolveConflictResponse>("/resources/resolve-conflict", { method: "POST", body })
  },

  /* Teacher portal (teacher) */
  async teacherClasses(): Promise<ClassResponse[]> {
    return request<ClassResponse[]>("/portals/teacher/my-classes")
  },

  /* Student portal (student) */
  async studentSchedule(): Promise<ClassResponse[]> {
    return request<ClassResponse[]>("/portals/student/my-schedule")
  },
  async studentAttendanceSummary(): Promise<StudentAttendanceSummaryResponse> {
    return request<StudentAttendanceSummaryResponse>("/portals/student/attendance-summary")
  },

  /* Attendance (teacher, admin) */
  async processAttendanceSheet(file: File, date?: string): Promise<ProcessSheetResponse> {
    const fd = new FormData()
    fd.append("file", file)
    if (date) fd.append("date", date)
    return request<ProcessSheetResponse>("/attendance/process-sheet", { method: "POST", formData: fd })
  },
  async syncAttendanceRecords(date: string, records: ExtractedAttendanceRecord[]): Promise<SyncBulkResponse> {
    return request<SyncBulkResponse>("/attendance/sync-bulk", { method: "POST", body: { date, records } })
  },
  async processBulkRegister(file: File): Promise<BulkAttendanceResponse> {
    const fd = new FormData()
    fd.append("file", file)
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 60000)
    try {
      return await request<BulkAttendanceResponse>("/attendance/process-bulk-register", { method: "POST", formData: fd, signal: controller.signal })
    } finally {
      clearTimeout(id)
    }
  },
  async finalizeBulkRegister(payload: FinalizeBulkAttendanceRequest): Promise<{ status: string; message: string; batch_id: string }> {
    return request<{ status: string; message: string; batch_id: string }>("/attendance/finalize-bulk", { method: "POST", body: payload })
  },
  async facultyClockIn(latitude: number, longitude: number, file: File, livenessProof?: string, teacherId?: string): Promise<ClockInResponse> {
    const fd = new FormData()
    fd.append("latitude", String(latitude))
    fd.append("longitude", String(longitude))
    fd.append("file", file)
    if (livenessProof) {
      fd.append("liveness_proof", livenessProof)
    }
    if (teacherId) {
      fd.append("teacher_id_param", teacherId)
    }
    return request<ClockInResponse>("/attendance/faculty-clock-in", { method: "POST", formData: fd })
  },
  async facultyAttendanceSummary(date?: string): Promise<FacultyAttendanceSummaryResponse> {
    const qs = date ? `?date=${encodeURIComponent(date)}` : ""
    return request<FacultyAttendanceSummaryResponse>(`/attendance/faculty-summary${qs}`)
  },
  getAttendanceProofUrl(recordId: string): string {
    return `${API_V1}/attendance/proof/${encodeURIComponent(recordId)}`
  },
  async getDailySessions(date?: string): Promise<DailySessionStatusResponse> {
    const qs = date ? `?date=${encodeURIComponent(date)}` : ""
    return request<DailySessionStatusResponse>(`/attendance/daily-sessions${qs}`)
  },
  async getSessionRoster(date: string, cohortId: string, subjectId?: string, period?: string, facultyId?: string): Promise<SessionRosterResponse> {
    const params = new URLSearchParams({ date, cohort_id: cohortId })
    if (subjectId) params.set("subject_id", subjectId)
    if (period) params.set("period", period)
    if (facultyId) params.set("faculty_id", facultyId)
    return request<SessionRosterResponse>(`/attendance/session-roster?${params.toString()}`)
  },
  async recordSessionAttendance(payload: RecordSessionAttendanceRequest): Promise<{ status: string; message: string; records_count: number }> {
    return request<{ status: string; message: string; records_count: number }>("/attendance/record-session", { method: "POST", body: payload })
  },

  /* Attendance analytics (admin) */
  async attendanceSummary(date?: string): Promise<AttendanceSummaryResponse> {
    const tzOffset = new Date().getTimezoneOffset()
    const qs = date ? `?date=${encodeURIComponent(date)}&tz_offset_minutes=${tzOffset}` : `?tz_offset_minutes=${tzOffset}`
    return request<AttendanceSummaryResponse>(`/admin/attendance/summary${qs}`)
  },
  async roster(limit = 200): Promise<StudentRecord[]> {
    return request<StudentRecord[]>(`/admin/students?limit=${limit}`)
  },
  async dashboardSummary(): Promise<DashboardSummaryResponse> {
    const tzOffset = new Date().getTimezoneOffset()
    return request<DashboardSummaryResponse>(`/admin/dashboard-summary?tz_offset_minutes=${tzOffset}`)
  },

  /* Timetable active / activate / validate (admin) */
  async getActiveTimetable(): Promise<ActiveTimetableResponse> {
    return request<ActiveTimetableResponse>("/timetable/active")
  },
  async activateTimetable(data: ActivateTimetableRequest): Promise<{ status: string; message: string; active_timetable: ActiveTimetableResponse }> {
    return request<{ status: string; message: string; active_timetable: ActiveTimetableResponse }>("/timetable/activate", { method: "POST", body: data })
  },
  async validateTimetable(data: Record<string, any>): Promise<ValidateTimetableResponse> {
    return request<ValidateTimetableResponse>("/timetable/validate", { method: "POST", body: data })
  },

  /* Transport (admin) */
  async optimizeRoutes(payload: TransportOptimizationRequest): Promise<TransportOptimizationResponse> {
    return request<TransportOptimizationResponse>("/transport/optimize-routes", { method: "POST", body: payload })
  },
  async transportRoutesSummary(): Promise<TransportRoutesSummaryResponse> {
    return request<TransportRoutesSummaryResponse>("/transport/routes-summary")
  },

  /* Knowledge base / RAG (admin) */
  async queryKnowledge(query: string, signal?: AbortSignal): Promise<RAGResponse> {
    return request<RAGResponse>("/knowledge/query", { method: "POST", body: { query }, signal })
  },
  async uploadKnowledgeDocument(file: File): Promise<KnowledgeUploadResponse> {
    const fd = new FormData()
    fd.append("file", file)
    return request<KnowledgeUploadResponse>("/knowledge/upload", { method: "POST", formData: fd })
  },
  /** Lists all uploaded knowledge/school documents (admin only). */
  async listKnowledgeDocuments(skip = 0, limit = 50): Promise<KnowledgeDocumentSummary[]> {
    return request<KnowledgeDocumentSummary[]>(`/knowledge/documents?skip=${skip}&limit=${limit}`)
  },
  /** Deletes a knowledge document and its ChromaDB vectors (admin only). */
  async deleteKnowledgeDocument(docId: string): Promise<void> {
    return request<void>(`/knowledge/documents/${encodeURIComponent(docId)}`, { method: "DELETE" })
  },

  /* Document intake / OCR (admin) */
  async extractDocument(file: File): Promise<DocumentExtractResponse> {
    const fd = new FormData()
    fd.append("file", file)
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 90000)
    try {
      return await request<DocumentExtractResponse>("/documents/extract", { method: "POST", formData: fd, signal: controller.signal })
    } finally {
      clearTimeout(id)
    }
  },
  async approveDocument(documentId: string, payload?: any): Promise<{ status: string; message: string }> {
    return request<{ status: string; message: string }>(`/documents/${encodeURIComponent(documentId)}/approve`, { method: "POST", body: payload })
  },

  /* Admin directory management (admin only) */
  async listStudents(skip = 0, limit = 100, cohort?: string): Promise<any[]> {
    const qs = cohort ? `&cohort=${encodeURIComponent(cohort)}` : ""
    return request<any[]>(`/admin/students?skip=${skip}&limit=${limit}${qs}`)
  },
  async createStudent(body: any): Promise<any> {
    return request<any>("/admin/students", { method: "POST", body })
  },
  async updateStudent(studentId: string, body: any): Promise<any> {
    return request<any>(`/admin/students/${encodeURIComponent(studentId)}`, { method: "PUT", body })
  },
  async deleteStudent(studentId: string): Promise<any> {
    return request<any>(`/admin/students/${encodeURIComponent(studentId)}`, { method: "DELETE" })
  },
  async bulkImportStudents(file?: File, payload?: any[]): Promise<any> {
    if (file) {
      const fd = new FormData()
      fd.append("file", file)
      return request<any>("/admin/students/bulk", { method: "POST", formData: fd })
    }
    return request<any>("/admin/students/bulk", { method: "POST", body: payload })
  },

  async listTeachers(skip = 0, limit = 100): Promise<any[]> {
    return request<any[]>(`/admin/teachers?skip=${skip}&limit=${limit}`)
  },
  async createTeacher(body: any): Promise<any> {
    return request<any>("/admin/teachers", { method: "POST", body })
  },
  async updateTeacher(teacherId: string, body: any): Promise<any> {
    return request<any>(`/admin/teachers/${encodeURIComponent(teacherId)}`, { method: "PUT", body })
  },
  async deleteTeacher(teacherId: string, force = false): Promise<any> {
    return request<any>(`/admin/teachers/${encodeURIComponent(teacherId)}?force=${force}`, { method: "DELETE" })
  },

  async listClasses(skip = 0, limit = 100): Promise<any[]> {
    return request<any[]>(`/admin/classes?skip=${skip}&limit=${limit}`)
  },
  async createClass(body: any): Promise<any> {
    return request<any>("/admin/classes", { method: "POST", body })
  },
  async updateClass(classId: string, body: any): Promise<any> {
    return request<any>(`/admin/classes/${encodeURIComponent(classId)}`, { method: "PUT", body })
  },
  async deleteClass(classId: string): Promise<any> {
    return request<any>(`/admin/classes/${encodeURIComponent(classId)}`, { method: "DELETE" })
  },

  async listSubjects(skip = 0, limit = 100): Promise<any[]> {
    return request<any[]>(`/admin/subjects?skip=${skip}&limit=${limit}`)
  },
  async createSubject(body: any): Promise<any> {
    return request<any>("/admin/subjects", { method: "POST", body })
  },
  async updateSubject(subjectId: string, body: any): Promise<any> {
    return request<any>(`/admin/subjects/${encodeURIComponent(subjectId)}`, { method: "PUT", body })
  },
  async deleteSubject(subjectId: string): Promise<any> {
    return request<any>(`/admin/subjects/${encodeURIComponent(subjectId)}`, { method: "DELETE" })
  },

  async listRooms(skip = 0, limit = 100): Promise<any[]> {
    return request<any[]>(`/admin/rooms?skip=${skip}&limit=${limit}`)
  },
  async createRoom(body: any): Promise<any> {
    return request<any>("/admin/rooms", { method: "POST", body })
  },
  async updateRoom(roomId: string, body: any): Promise<any> {
    return request<any>(`/admin/rooms/${encodeURIComponent(roomId)}`, { method: "PUT", body })
  },
  async deleteRoom(roomId: string): Promise<any> {
    return request<any>(`/admin/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" })
  },

  /* Timetable Entities */
  async getTimetableEntities(): Promise<any> {
    return request<any>("/timetable/entities")
  },

  /* Alerts History */
  async getAlertsHistory(limit = 50, status?: string): Promise<any[]> {
    const qs = status ? `?limit=${limit}&status=${encodeURIComponent(status)}` : `?limit=${limit}`
    return request<any[]>(`/alerts/history${qs}`)
  },
  async resolveAlert(alertId: string): Promise<any> {
    return request<any>(`/alerts/${encodeURIComponent(alertId)}/resolve`, { method: "PATCH" })
  },
}

/* ── Admin user management payload types ────────────────────────────── */

export interface KnowledgeDocumentSummary {
  id: string
  title: string
  total_chunks: number
  file_hash: string
  upload_date: string
  indexing_status: string
  error_message: string | null
}

export interface AdminStudentRecord {
  student_id: string
  full_name: string
  grade: string
  section: string
  email: string
}

export interface CreateStudentPayload {
  student_id: string
  full_name: string
  grade: string
  section: string
  email: string
}

export interface AdminTeacherRecord {
  teacher_id: string
  full_name: string
  subjects: string[]
  email: string
}

export interface CreateTeacherPayload {
  teacher_id: string
  full_name: string
  subjects: string[]
  email: string
}

export interface CreateClassPayload {
  class_id: string
  teacher_id: string
  subject: string
  schedule_time: string
  grade: string
  section: string
}


