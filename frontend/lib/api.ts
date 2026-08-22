import { API_V1, TOKEN_STORAGE_KEY } from "./config"
import type {
  AttendanceSummaryResponse,
  ClassResponse,
  ClockInResponse,
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
  SyncBulkResponse
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

  async me(): Promise<User> {
    return request<User>("/auth/me")
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
  async facultyClockIn(latitude: number, longitude: number, file: File): Promise<ClockInResponse> {
    const fd = new FormData()
    fd.append("latitude", String(latitude))
    fd.append("longitude", String(longitude))
    fd.append("file", file)
    return request<ClockInResponse>("/attendance/faculty-clock-in", { method: "POST", formData: fd })
  },

  /* Attendance analytics (admin) */
  async attendanceSummary(date?: string): Promise<AttendanceSummaryResponse> {
    const tzOffset = new Date().getTimezoneOffset()
    const qs = date ? `?date=${encodeURIComponent(date)}&tz_offset_minutes=${tzOffset}` : `?tz_offset_minutes=${tzOffset}`
    return request<AttendanceSummaryResponse>(`/admin/attendance/summary${qs}`)
  },
  async roster(limit = 100): Promise<StudentRecord[]> {
    return request<StudentRecord[]>(`/admin/students?limit=${limit}`)
  },
  async dashboardSummary(): Promise<DashboardSummaryResponse> {
    const tzOffset = new Date().getTimezoneOffset()
    return request<DashboardSummaryResponse>(`/admin/dashboard-summary?tz_offset_minutes=${tzOffset}`)
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

  /* Admin user management (admin only) */
  async listStudents(skip = 0, limit = 50): Promise<AdminStudentRecord[]> {
    return request<AdminStudentRecord[]>(`/admin/students?skip=${skip}&limit=${limit}`)
  },
  async createStudent(body: CreateStudentPayload): Promise<AdminStudentRecord> {
    return request<AdminStudentRecord>("/admin/students", { method: "POST", body })
  },
  async listTeachers(skip = 0, limit = 50): Promise<AdminTeacherRecord[]> {
    return request<AdminTeacherRecord[]>(`/admin/teachers?skip=${skip}&limit=${limit}`)
  },
  async createTeacher(body: CreateTeacherPayload): Promise<AdminTeacherRecord> {
    return request<AdminTeacherRecord>("/admin/teachers", { method: "POST", body })
  },
  async listClasses(skip = 0, limit = 50): Promise<ClassResponse[]> {
    return request<ClassResponse[]>(`/admin/classes?skip=${skip}&limit=${limit}`)
  },
  async createClass(body: CreateClassPayload): Promise<ClassResponse> {
    return request<ClassResponse>("/admin/classes", { method: "POST", body })
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

