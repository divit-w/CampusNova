"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { api, clearToken, getToken, setToken } from "./api"
import type { User } from "./types"

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  loginWithGoogle: (credential: string) => Promise<User>
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const hydratedRef = useRef(false)

  const hydrate = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await api.me()
      setUser(me)
    } catch {
      clearToken()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    void hydrate()
  }, [hydrate])

  const login = useCallback(async (email: string, password: string) => {
    const token = await api.login(email, password)
    setToken(token.access_token)
    const me = await api.me()
    setUser(me)
    return me
  }, [])

  const loginWithGoogle = useCallback(async (credential: string) => {
    const token = await api.loginWithGoogle(credential)
    setToken(token.access_token)
    const me = await api.me()
    setUser(me)
    return me
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, loginWithGoogle, logout, refresh: hydrate }),
    [user, loading, login, loginWithGoogle, logout, hydrate],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider")
  return ctx
}

