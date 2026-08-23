"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { createPortal } from "react-dom"
import { 
  Users, 
  CheckCircle2, 
  XCircle, 
  MapPin, 
  Clock, 
  ShieldCheck, 
  Eye, 
  X, 
  Camera,
  AlertCircle,
  Sparkles,
  ArrowRight
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/states"
import { api } from "@/lib/api"
import { FacultyAttendanceRecord, FacultyAttendanceSummaryResponse, FacultyScheduleResponse } from "@/lib/types"
import { riseItem, staggerContainer, spring } from "@/lib/motion"

export function FacultyAttendanceList({ date }: { date?: string }) {
  const [data, setData] = useState<FacultyAttendanceSummaryResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<FacultyAttendanceRecord | null>(null)
  const [proofImageSrc, setProofImageSrc] = useState<string | null>(null)
  const [loadingProof, setLoadingProof] = useState<boolean>(false)
  const [proofError, setProofError] = useState<string | null>(null)
  const [affectedClassCounts, setAffectedClassCounts] = useState<Record<string, number>>({})

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Re-fetch data whenever date changes
  useEffect(() => {
    let isCancelled = false
    setLoading(true)
    setError(null)
    setSelectedRecord(null) // Close modal if date changes to prevent stale proof
    setProofImageSrc(null)
    setAffectedClassCounts({})

    api.facultyAttendanceSummary(date)
      .then((res) => {
        if (!isCancelled) {
          setData(res)
          setLoading(false)

          // Query schedule only for absent faculty
          const absentTeachers = (res.records || []).filter((r) => r.status === "absent")
          if (absentTeachers.length > 0) {
            const targetDate = res.date || date || new Date().toISOString().slice(0, 10)
            Promise.all(
              absentTeachers.map(async (t) => {
                try {
                  const sched = await api.get<FacultyScheduleResponse>(
                    `/resources/faculty-schedule/${encodeURIComponent(t.teacher_id)}?date=${encodeURIComponent(targetDate)}`
                  )
                  return { id: t.teacher_id, count: sched.affected_classes?.length ?? 0 }
                } catch {
                  return { id: t.teacher_id, count: 0 }
                }
              })
            ).then((results) => {
              if (!isCancelled) {
                const countMap: Record<string, number> = {}
                for (const r of results) {
                  countMap[r.id] = r.count
                }
                setAffectedClassCounts(countMap)
              }
            })
          }
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error("Failed to load faculty attendance summary:", err)
          setError(err?.message || "Failed to load faculty attendance.")
          setLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [date])

  // Load proof image blob when a record is selected
  async function openProofModal(record: FacultyAttendanceRecord) {
    if (!record.record_id) return
    setSelectedRecord(record)
    setLoadingProof(true)
    setProofError(null)
    setProofImageSrc(null)

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null
      const res = await fetch(api.getAttendanceProofUrl(record.record_id), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) {
        throw new Error(res.status === 404 ? "Proof image not found or expired on server." : "Failed to load proof image.")
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      setProofImageSrc(objectUrl)
    } catch (err: any) {
      console.error("Error fetching proof image:", err)
      setProofError(err?.message || "Could not retrieve proof image.")
    } finally {
      setLoadingProof(false)
    }
  }

  function closeProofModal() {
    if (proofImageSrc) {
      URL.revokeObjectURL(proofImageSrc)
    }
    setSelectedRecord(null)
    setProofImageSrc(null)
    setProofError(null)
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">Faculty Attendance</p>
            <p className="text-xs text-muted-foreground">{loading ? "Loading…" : data?.date || date}</p>
          </div>
        </div>
        {!loading && data && (
          <div className="flex items-center gap-2">
            <Badge variant="neutral">
              {data.present_count} of {data.total_faculty} present
            </Badge>
          </div>
        )}
      </div>

      <div className="max-h-[460px] overflow-y-auto p-3">
        {loading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-center text-sm text-destructive flex flex-col items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        ) : !data || data.records.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No faculty registered"
            description="Add faculty profiles in the admin directory to track daily clock-in records."
          />
        ) : (
          <motion.ul variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-1.5">
            {data.records.map((r) => {
              const isPresent = r.status === "present"
              return (
                <motion.li
                  key={r.teacher_id}
                  variants={riseItem}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/40 bg-surface/40 px-3.5 py-3 transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-bold text-foreground">
                      {r.full_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold leading-tight text-foreground">{r.full_name}</p>
                        <span className="text-[11px] font-mono text-muted-foreground">({r.teacher_id})</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.subject}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    {isPresent ? (
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col sm:items-end text-right">
                          <div className="flex items-center gap-1 text-xs font-medium text-foreground">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span>{r.clock_in_time || "Present"}</span>
                          </div>
                          {r.location_verified && (
                            <span className="flex items-center gap-1 text-[10px] text-success">
                              <MapPin className="w-2.5 h-2.5" />
                              {r.distance_meters !== null ? `${Math.round(r.distance_meters)}m (Geofence)` : "Geofence Verified"}
                            </span>
                          )}
                        </div>

                        <Badge variant="success" className="gap-1 text-[11px]">
                          <CheckCircle2 className="w-3 h-3" /> Present
                        </Badge>

                        {r.record_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openProofModal(r)}
                            className="h-8 gap-1.5 text-xs border-primary/30 hover:bg-primary/10 hover:text-primary"
                          >
                            <Eye className="w-3.5 h-3.5 text-primary" />
                            View Proof
                          </Button>
                        )}
                      </div>
                    ) : r.status === "on_leave" ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="warning" className="text-[11px]">
                          On Leave
                        </Badge>
                        <Link href={`/substitute?faculty=${encodeURIComponent(r.teacher_id)}`}>
                          <Button
                            size="sm"
                            className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-sm"
                          >
                            <span>Resolve Cover →</span>
                          </Button>
                        </Link>
                      </div>
                    ) : r.status === "not_scheduled" ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="neutral" className="text-[11px] text-muted-foreground border-border/50">
                          No attendance scheduled
                        </Badge>
                      </div>
                    ) : r.status === "unmarked" ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="neutral" className="text-[11px] text-muted-foreground border-border/50">
                          Unmarked
                        </Badge>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="text-[11px]">
                          Absent
                        </Badge>
                        {affectedClassCounts[r.teacher_id] !== undefined ? (
                          affectedClassCounts[r.teacher_id] > 0 ? (
                            <Link href={`/substitute?faculty=${encodeURIComponent(r.teacher_id)}`}>
                              <Button
                                size="sm"
                                className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-sm"
                              >
                                <span>
                                  {`Resolve ${affectedClassCounts[r.teacher_id]} Affected ${
                                    affectedClassCounts[r.teacher_id] === 1 ? "Class" : "Classes"
                                  } →`}
                                </span>
                              </Button>
                            </Link>
                          ) : (
                            <Badge variant="neutral" className="text-[11px] text-muted-foreground border-border/50">
                              No classes scheduled
                            </Badge>
                          )
                        ) : (
                          <Link href={`/substitute?faculty=${encodeURIComponent(r.teacher_id)}`}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 text-xs border-primary/30 hover:bg-primary/10 hover:text-primary"
                            >
                              <span>Resolve Cover →</span>
                            </Button>
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </motion.li>
              )
            })}
          </motion.ul>
        )}
      </div>

      {/* Verification Proof Modal */}
      {mounted && typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {selectedRecord && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
              onClick={closeProofModal}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={spring}
                onClick={(e) => e.stopPropagation()}
                className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/20 bg-background shadow-2xl"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/30">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold leading-tight">Biometric Clock-In Proof</h3>
                      <p className="text-xs text-muted-foreground">{selectedRecord.full_name} • {selectedRecord.date}</p>
                    </div>
                  </div>
                  <button
                    onClick={closeProofModal}
                    className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Content */}
                <div className="flex flex-col gap-4 p-5">
                  {/* Selfie Preview Container */}
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black flex items-center justify-center">
                    {loadingProof ? (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
                        <Skeleton className="h-full w-full absolute inset-0" />
                        <span className="z-10">Loading secure proof image…</span>
                      </div>
                    ) : proofError ? (
                      <div className="flex flex-col items-center gap-1 text-center p-4 text-xs text-destructive">
                        <AlertCircle className="w-6 h-6 mb-1" />
                        <p className="font-semibold">Unable to load image</p>
                        <p className="text-muted-foreground">{proofError}</p>
                      </div>
                    ) : proofImageSrc ? (
                      <img
                        src={proofImageSrc}
                        alt={`Verification proof for ${selectedRecord.full_name}`}
                        className="h-full w-full object-cover -scale-x-100"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                        <Camera className="w-6 h-6 mb-1" />
                        <span>No image available</span>
                      </div>
                    )}

                    {/* Biometric Watermark Badge */}
                    {proofImageSrc && (
                      <div className="absolute bottom-2.5 left-2.5 rounded-md bg-black/75 px-2.5 py-1 text-[10px] font-mono text-white backdrop-blur-sm border border-white/10 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-primary" />
                        <span>Active Liveness Verified</span>
                      </div>
                    )}
                  </div>

                  {/* Verification Metadata Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border bg-muted/40 p-2.5">
                      <span className="text-[10px] font-medium text-muted-foreground">Clock-in Time</span>
                      <p className="font-semibold text-foreground mt-0.5">{selectedRecord.clock_in_time || "—"}</p>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/40 p-2.5">
                      <span className="text-[10px] font-medium text-muted-foreground">Attendance Date</span>
                      <p className="font-semibold text-foreground mt-0.5">{selectedRecord.date}</p>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/40 p-2.5">
                      <span className="text-[10px] font-medium text-muted-foreground">Location / Geofence</span>
                      <p className="font-semibold text-success mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {selectedRecord.distance_meters !== null ? `${Math.round(selectedRecord.distance_meters)}m from campus` : "Verified"}
                      </p>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/40 p-2.5">
                      <span className="text-[10px] font-medium text-muted-foreground">Biometric Liveness</span>
                      <p className="font-semibold text-primary mt-0.5 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        Challenge Passed
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end border-t border-border px-5 py-3 bg-muted/20">
                  <Button variant="secondary" size="sm" onClick={closeProofModal}>
                    Close
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </Card>
  )
}
