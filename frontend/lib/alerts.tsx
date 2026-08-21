"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { API_V1 } from "./config"
import { getToken } from "./api"
import type { AlertEvent, FeedAlert } from "./types"

export type ConnectionStatus = "connecting" | "connected" | "reconnecting"

interface AlertState {
  status: ConnectionStatus
  feed: FeedAlert[]
  clearFeed: () => void
}

const AlertContext = createContext<AlertState>({
  status: "connecting",
  feed: [],
  clearFeed: () => {},
})

const MAX_FEED = 30
const BASE_BACKOFF = 1000
const MAX_BACKOFF = 15000

/**
 * Global SSE listener for /alerts/stream.
 *
 * Leak-safe contract (audit P0-1):
 *   - the EventSource instance lives in a ref, never in state, so re-renders
 *     never spawn duplicate sockets;
 *   - the reconnect timer id lives in a ref;
 *   - the effect cleanup calls es.close() AND clears the reconnect timer, so
 *     unmount / token change never leaks a socket or a pending timer.
 */
export function AlertProvider({
  token,
  children,
}: {
  token: string | null
  children: React.ReactNode
}) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting")
  const [feed, setFeed] = useState<FeedAlert[]>([])

  const esRef = useRef<EventSource | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptsRef = useRef(0)
  const lastAlertRef = useRef<{ message: string; at: number } | null>(null)

  useEffect(() => {
    const authToken = token ?? getToken()
    if (!authToken) return

    let disposed = false

    const clearReconnect = () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
    }

    const connect = () => {
      // Always tear down any prior instance before opening a new one.
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }

      setStatus(attemptsRef.current === 0 ? "connecting" : "reconnecting")

      const es = new EventSource(`${API_V1}/alerts/stream?token=${encodeURIComponent(authToken)}`)
      esRef.current = es

      es.onopen = () => {
        attemptsRef.current = 0
        if (!disposed) setStatus("connected")
      }

      es.onmessage = (event) => {
        if (disposed) return
        setStatus("connected")
        let data: AlertEvent
        try {
          data = JSON.parse(event.data)
        } catch {
          return
        }
        if (data.type !== "alert" || !data.message) return

        // Dedupe identical consecutive alerts fired within 4s.
        const now = Date.now()
        const last = lastAlertRef.current
        if (last && last.message === data.message && now - last.at < 4000) return
        lastAlertRef.current = { message: data.message, at: now }

        const item: FeedAlert = {
          id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
          message: data.message,
          receivedAt: now,
        }
        setFeed((prev) => [item, ...prev].slice(0, MAX_FEED))
        toast(data.message, { description: "Live alert" })
      }

      es.onerror = () => {
        if (disposed) return
        es.close()
        esRef.current = null
        setStatus("reconnecting")
        attemptsRef.current += 1
        const delay = Math.min(BASE_BACKOFF * 2 ** (attemptsRef.current - 1), MAX_BACKOFF)
        clearReconnect()
        reconnectRef.current = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      disposed = true
      clearReconnect()
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }
  }, [token])

  return (
    <AlertContext.Provider value={{ status, feed, clearFeed: () => setFeed([]) }}>
      {children}
    </AlertContext.Provider>
  )
}

export function useAlerts(): AlertState {
  return useContext(AlertContext)
}
