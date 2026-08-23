/**
 * Base URL of the CampusNova FastAPI backend.
 * Override in production via NEXT_PUBLIC_API_URL (e.g. https://api.campusnova.app).
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000"

export const API_V1 = `${API_BASE_URL}/api/v1`

export const TOKEN_STORAGE_KEY = "campusnova.token"
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""
