"use client"

import { useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Camera, CheckCircle2, MapPin, ShieldCheck, UserRoundCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ErrorState } from "@/components/states"
import { api, ApiError } from "@/lib/api"
import type { ClockInResponse } from "@/lib/types"
import { spring } from "@/lib/motion"

type GeoState = "idle" | "locating" | "located" | "denied"

/**
 * Simulates the on-site clock-in flow: capture the browser's geolocation
 * (checked server-side against the campus geofence) and a selfie (checked
 * server-side for liveness via Vision API), then POST /attendance/faculty-clock-in.
 */
export function FacultyClockIn() {
  const [geoState, setGeoState] = useState<GeoState>("idle")
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [selfie, setSelfie] = useState<File | null>(null)
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ClockInResponse | null>(null)
  const [error, setError] = useState<unknown>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function locate() {
    if (!("geolocation" in navigator)) {
      setGeoState("denied")
      return
    }
    setGeoState("locating")
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        setGeoState("located")
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  function pickSelfie(f: File | undefined | null) {
    if (!f) return
    setResult(null)
    setError(null)
    setSelfie(f)
    setSelfiePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
  }

  async function submit() {
    if (!coords || !selfie || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.facultyClockIn(coords.lat, coords.lon, selfie)
      setResult(res)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  const outsideGeofence = error instanceof ApiError && error.status === 403
  const livenessFailed = error instanceof ApiError && error.status === 400

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-live/10 text-live">
          <ShieldCheck className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="text-sm font-semibold leading-tight">Faculty clock-in</p>
          <p className="text-xs text-muted-foreground">Geofence + selfie liveness check</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {/* Step 1 — geofence */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface/60 p-3.5">
          <div className="flex items-center gap-2.5">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Location</p>
              {geoState === "located" && coords ? (
                <p className="text-xs tabular-nums text-muted-foreground">
                  {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Not captured yet</p>
              )}
            </div>
          </div>
          {geoState === "located" ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Captured
            </Badge>
          ) : (
            <Button variant="outline" size="sm" onClick={locate} disabled={geoState === "locating"}>
              {geoState === "locating" ? "Locating…" : "Share location"}
            </Button>
          )}
        </div>
        {geoState === "denied" && (
          <p className="-mt-1 text-xs text-destructive">
            Location unavailable. Enable browser location permissions to continue.
          </p>
        )}

        {/* Step 2 — selfie */}
        <div
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 p-3.5 transition-colors hover:bg-accent/50"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            className="sr-only"
            onChange={(e) => pickSelfie(e.target.files?.[0])}
          />
          <div className="flex items-center gap-2.5">
            {selfiePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selfiePreview || "/placeholder.svg"}
                alt="Selfie preview"
                className="h-9 w-9 shrink-0 rounded-lg object-cover"
                crossOrigin="anonymous"
              />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
                <Camera className="h-4 w-4" />
              </span>
            )}
            <div>
              <p className="text-sm font-medium">Selfie</p>
              <p className="text-xs text-muted-foreground">{selfie ? selfie.name : "Tap to capture or upload"}</p>
            </div>
          </div>
          {selfie && (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Ready
            </Badge>
          )}
        </div>
      </div>

      <Button onClick={submit} disabled={!coords || !selfie || loading} className="mt-4 gap-1.5">
        <UserRoundCheck className="h-4 w-4" />
        {loading ? "Verifying…" : "Clock in"}
      </Button>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring}
            className="mt-4 flex items-center gap-2.5 rounded-xl border border-success/20 bg-success/[0.06] px-4 py-3"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <p className="text-pretty text-sm leading-snug text-foreground">{result.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {error && !outsideGeofence && !livenessFailed && (
        <div className="mt-2">
          <ErrorState error={error} onRetry={submit} />
        </div>
      )}
      {outsideGeofence && (
        <p className="mt-3 text-sm text-destructive">
          You&apos;re outside the campus geofence. Move closer to campus and try again.
        </p>
      )}
      {livenessFailed && (
        <p className="mt-3 text-sm text-destructive">
          Liveness check failed — retake the selfie in good lighting facing the camera.
        </p>
      )}
    </Card>
  )
}
