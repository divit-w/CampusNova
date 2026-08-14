import { API_V1, TOKEN_STORAGE_KEY } from "./config"
import type {
  AttendanceSummaryResponse,
  ClassResponse,
  ClockInResponse,
  GenerateJobAck,
  ProcessSheetResponse,
  PromptResponse,
  ResolveConflictResponse,
  ResourceConflictRequest,
  StudentRecord,
  TimetableConstraintPayload,
  TimetableJob,
  Token,
  TransportOptimizationRequest,
  TransportOptimizationResponse,
  User,
} from "./types"

/** Normalized error that carries the HTTP status so UI can branch on 401/403/429/502. */
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
    if ((err as Error)?.name === "AbortError") throw err
    // network / CORS / backend unreachable
    throw new ApiError(0, "Cannot reach the CampusNova backend. Check that the API is running and NEXT_PUBLIC_API_URL is correct.")
  }

  // Auto-logout on expired/invalid session (except the login call itself).
  if (res.status === 401 && auth) {
    clearToken()
  }

  if (!res.ok) {
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

  /* Attendance (teacher, admin) */
  async processAttendanceSheet(file: File, date?: string): Promise<ProcessSheetResponse> {
    const fd = new FormData()
    fd.append("file", file)
    if (date) fd.append("date", date)
    return request<ProcessSheetResponse>("/attendance/process-sheet", { method: "POST", formData: fd })
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
    const qs = date ? `?date=${encodeURIComponent(date)}` : ""
    return request<AttendanceSummaryResponse>(`/admin/attendance/summary${qs}`)
  },
  async roster(limit = 100): Promise<StudentRecord[]> {
    return request<StudentRecord[]>(`/admin/students?limit=${limit}`)
  },

  /* Transport (admin) */
  async optimizeRoutes(payload: TransportOptimizationRequest): Promise<TransportOptimizationResponse> {
    return request<TransportOptimizationResponse>("/transport/optimize-routes", { method: "POST", body: payload })
  },
}
