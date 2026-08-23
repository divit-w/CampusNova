"use client"

import { useMemo, useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { motion } from "framer-motion"
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  Lock,
  GripVertical,
  User,
  MapPin,
  Users,
  Clock,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import type { TimetablePayload, ScheduleEntry, TimetableResult } from "@/lib/types"
import { getSubjectColor } from "@/lib/subject-color"
import { spring } from "@/lib/motion"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { validateScheduleMove, isEntryPinned } from "@/lib/timetable-validator"

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

interface Lookups {
  teacher: Record<string, string>
  room: Record<string, string>
  subject: Record<string, string>
  cohort: Record<string, string>
}

/** Explainability summary derived from the solver status + submitted constraints. */
function Explainability({
  result,
  payload,
}: {
  result: TimetableResult
  payload: TimetablePayload
}) {
  const optimal = result.status === "OPTIMAL"
  const feasible = result.status === "FEASIBLE"
  const isConflicted = result.status === "CONFLICTED"
  const totalRequired =
    payload.course_offerings && payload.course_offerings.length > 0
      ? payload.course_offerings.reduce((sum, o) => sum + o.required_weekly_hours, 0)
      : payload.cohorts.length
        ? payload.subjects.reduce((sum, s) => sum + (s.required_weekly_hours || 0), 0) * payload.cohorts.length
        : payload.subjects.reduce((sum, s) => sum + (s.required_weekly_hours || 0), 0)
  const placed = result.schedule.length

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-background/80 border border-border/70 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {optimal && (
          <Badge variant="success" className="gap-1.5 font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Optimal Mathematical Solution
          </Badge>
        )}
        {feasible && (
          <Badge variant="warning" className="gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            Feasible Schedule (Zero Hard Collisions)
          </Badge>
        )}
        {isConflicted && (
          <Badge variant="destructive" className="gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            Unresolved Baseline Schedule (Action Required)
          </Badge>
        )}
        <Badge variant="neutral" className="gap-1 font-medium">
          <Info className="h-3 w-3 text-muted-foreground" />
          <span className="font-bold text-foreground">{placed}</span> / {totalRequired} sessions placed
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-[11px]">
        <Sparkles className="h-3 w-3 text-primary" />
        <span>Hard Constraints:</span>
        {payload.hard_constraints.slice(0, 3).map((hc) => (
          <span
            key={hc}
            className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground capitalize"
          >
            {hc.replace(/_/g, " ")}
          </span>
        ))}
      </div>
    </div>
  )
}

export function TimetableGrid({
  result,
  payload,
  schedule,
  onScheduleChange,
  cohortFilter,
  onCohortFilterChange,
  conflictEntryIndices,
  highlightSlot,
  readOnly = false,
}: {
  result: TimetableResult
  payload: TimetablePayload
  schedule: ScheduleEntry[]
  onScheduleChange: (newSchedule: ScheduleEntry[]) => void
  cohortFilter: string
  onCohortFilterChange: (cohortId: string) => void
  conflictEntryIndices?: number[]
  highlightSlot?: { teacherId?: string; period?: number; day?: number; cohortId?: string } | null
  readOnly?: boolean
}) {
  const lookups: Lookups = useMemo(
    () => ({
      teacher: Object.fromEntries(payload.teachers.map((t) => [t.id, t.name])),
      room: Object.fromEntries(payload.rooms.map((r) => [r.id, r.name || r.id])),
      subject: Object.fromEntries(payload.subjects.map((s) => [s.id, s.name])),
      cohort: Object.fromEntries(payload.cohorts.map((c) => [c.id, c.name])),
    }),
    [payload],
  )

  const [editingEntry, setEditingEntry] = useState<{ entry: ScheduleEntry; index: number } | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverCell, setDragOverCell] = useState<{ day: number; period: number } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Robust LIFO history stack for deep snapshot Undo
  const historyRef = useRef<ScheduleEntry[][]>([])

  const cells = useMemo(() => {
    const map = new Map<string, Array<{ entry: ScheduleEntry; index: number }>>()
    schedule.forEach((entry, index) => {
      if (cohortFilter !== "all" && entry.cohort_id !== cohortFilter) return
      const key = `${entry.day}-${entry.period}`
      const list = map.get(key) ?? []
      list.push({ entry, index })
      map.set(key, list)
    })
    return map
  }, [schedule, cohortFilter])

  const days = Array.from({ length: payload.days_per_week }, (_, i) => i)
  const periods = Array.from({ length: payload.periods_per_day }, (_, i) => i)

  const subjectsInView = useMemo(() => {
    const ids = new Set<string>()
    schedule.forEach((e) => {
      if (cohortFilter === "all" || e.cohort_id === cohortFilter) ids.add(e.subject_id)
    })
    return Array.from(ids)
  }, [schedule, cohortFilter])

  const handleDrop = (targetDay: number, targetPeriod: number) => {
    if (draggedIndex === null) return

    const draggedEntry = schedule[draggedIndex]
    if (!draggedEntry) {
      setDraggedIndex(null)
      setDragOverCell(null)
      return
    }

    // Dropping onto same slot is a no-op
    if (draggedEntry.day === targetDay && draggedEntry.period === targetPeriod) {
      setDraggedIndex(null)
      setDragOverCell(null)
      return
    }

    // Validate move against all constraints
    const validation = validateScheduleMove(draggedIndex, targetDay, targetPeriod, schedule, payload)
    if (!validation.valid) {
      toast.error(validation.reason || "Invalid move.")
      setDraggedIndex(null)
      setDragOverCell(null)
      return
    }

    // Push deep snapshot to history stack for exact Undo restoration
    historyRef.current.push(schedule.map((e) => ({ ...e })))

    // Apply immutable state update
    const nextSchedule = schedule.map((entry, idx) =>
      idx === draggedIndex ? { ...entry, day: targetDay, period: targetPeriod } : { ...entry },
    )
    onScheduleChange(nextSchedule)

    const subName = lookups.subject[draggedEntry.subject_id] ?? draggedEntry.subject_id
    const fromDayName = DAY_NAMES[draggedEntry.day] ?? `Day ${draggedEntry.day + 1}`
    const toDayName = DAY_NAMES[targetDay] ?? `Day ${targetDay + 1}`

    toast.success(`Moved ${subName}: ${fromDayName} P${draggedEntry.period + 1} → ${toDayName} P${targetPeriod + 1}`, {
      duration: 7000,
      action: {
        label: "Undo",
        onClick: () => {
          const previousState = historyRef.current.pop()
          if (previousState) {
            onScheduleChange(previousState)
            toast.info(`Restored ${subName} to ${fromDayName} P${draggedEntry.period + 1}`)
          }
        },
      },
    })

    setDraggedIndex(null)
    setDragOverCell(null)
  }

  return (
    <div className="space-y-4 w-full min-w-0 flex flex-col flex-1">
      {/* Top Status & Diagnostics Header */}
      <Explainability result={result} payload={payload} />

      {/* Cohort Tabs & Subject Legend Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 p-2.5 rounded-xl border border-border/60">
        {/* Cohort Selector (Segmented Button Pills for Instant Visibility) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground mr-1 flex items-center gap-1">
            <Users className="h-3 w-3" />
            Cohort:
          </span>
          <button
            type="button"
            onClick={() => onCohortFilterChange("all")}
            className={cn(
              "px-2.5 py-1 text-xs font-semibold rounded-lg transition-all border",
              cohortFilter === "all"
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background/80 text-muted-foreground border-border/80 hover:text-foreground hover:bg-background",
            )}
          >
            All Cohorts ({payload.cohorts.length})
          </button>
          {payload.cohorts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onCohortFilterChange(c.id)}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded-lg transition-all border flex items-center gap-1.5",
                cohortFilter === c.id
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-background/80 text-muted-foreground border-border/80 hover:text-foreground hover:bg-background",
              )}
            >
              <span>{c.id}</span>
              <span className={cn("text-[10px] opacity-75 font-normal", cohortFilter === c.id ? "text-primary-foreground" : "text-muted-foreground")}>
                ({c.student_count || 50} students)
              </span>
            </button>
          ))}
        </div>

        {/* Subject Palette Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {subjectsInView
            .filter((sid) => sid !== "BLOCKED")
            .slice(0, 5)
            .map((sid) => {
              const c = getSubjectColor(sid)
              return (
                <span key={sid} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className={cn("h-2 w-2 rounded-full", c.dot)} />
                  <span className="truncate max-w-[110px]">{lookups.subject[sid] ?? sid}</span>
                </span>
              )
            })}
        </div>
      </div>

      {/* Main Weekly Timetable Table Grid */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden w-full flex-1 flex flex-col">
        <table className="w-full border-collapse table-fixed text-left">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <th className="w-16 sm:w-20 px-2.5 py-3 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground border-r border-border">
                Period
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-foreground border-r border-border last:border-r-0"
                >
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-xs font-bold">{DAY_NAMES[d]}</span>
                    <span className="text-[10px] font-normal text-muted-foreground mt-0.5">
                      Day {d + 1}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {periods.map((p) => (
              <tr key={p} className="hover:bg-muted/[0.02] transition-colors">
                {/* Period Indicator Column */}
                <td className="w-16 sm:w-20 p-2 text-center bg-muted/20 border-r border-border align-middle">
                  <div className="flex flex-col items-center justify-center gap-0.5">
                    <span className="text-xs font-bold text-foreground">P{p + 1}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {p + 9}:00
                    </span>
                  </div>
                </td>

                {/* Day Columns */}
                {days.map((d) => {
                  const entries = cells.get(`${d}-${p}`) ?? []
                  const isHovered = dragOverCell?.day === d && dragOverCell?.period === p
                  let dropValidity: boolean | null = null
                  if (isHovered && draggedIndex !== null) {
                    dropValidity = validateScheduleMove(draggedIndex, d, p, schedule, payload).valid
                  }

                  return (
                    <td
                      key={d}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = "move"
                        if (dragOverCell?.day !== d || dragOverCell?.period !== p) {
                          setDragOverCell({ day: d, period: p })
                        }
                      }}
                      onDragLeave={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        if (
                          e.clientX < rect.left ||
                          e.clientX >= rect.right ||
                          e.clientY < rect.top ||
                          e.clientY >= rect.bottom
                        ) {
                          if (dragOverCell?.day === d && dragOverCell?.period === p) {
                            setDragOverCell(null)
                          }
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        handleDrop(d, p)
                      }}
                      className={cn(
                        "p-1.5 align-top border-r border-border last:border-r-0 transition-colors min-h-[90px] h-full",
                        isHovered && dropValidity === true && "bg-primary/10 ring-2 ring-inset ring-primary/60",
                        isHovered && dropValidity === false && "bg-destructive/10 ring-2 ring-inset ring-destructive/60",
                        draggedIndex !== null && !isHovered && "bg-muted/5",
                      )}
                    >
                      <div className="flex flex-col gap-1.5 min-h-[76px] h-full justify-start">
                        {entries.length === 0 ? (
                          <div className="h-full min-h-[64px] flex items-center justify-center rounded-lg border border-dashed border-border/40 text-[11px] text-muted-foreground/40 select-none">
                            Free
                          </div>
                        ) : (
                          entries.map(({ entry, index: realIndex }, i) => {
                            if (entry.subject_id === "BLOCKED") {
                              return (
                                <motion.div
                                  key={`blocked-${d}-${p}-${i}`}
                                  initial={{ opacity: 0, scale: 0.96 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className="w-full rounded-lg border border-muted-foreground/25 bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(0,0,0,0.04)_8px,rgba(0,0,0,0.04)_16px)] dark:bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(255,255,255,0.04)_8px,rgba(255,255,255,0.04)_16px)] p-2 text-center flex flex-col justify-center items-center min-h-[68px]"
                                >
                                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase opacity-80">
                                    Blocked Period
                                  </p>
                                  {cohortFilter === "all" && (
                                    <p className="text-[9px] text-muted-foreground mt-0.5 font-medium">
                                      {lookups.cohort[entry.cohort_id] ?? entry.cohort_id}
                                    </p>
                                  )}
                                </motion.div>
                              )
                            }

                            const color = getSubjectColor(entry.subject_id)
                            const pinned = isEntryPinned(entry, payload.fixed_slots)
                            const isBeingDragged = draggedIndex === realIndex
                            const isConflicted = conflictEntryIndices?.includes(realIndex)
                            const isDeepLinkHighlighted = Boolean(
                              highlightSlot &&
                              (!highlightSlot.teacherId || entry.teacher_id === highlightSlot.teacherId) &&
                              (highlightSlot.period === undefined || entry.period === highlightSlot.period) &&
                              (highlightSlot.day === undefined || entry.day === highlightSlot.day) &&
                              (!highlightSlot.cohortId || entry.cohort_id === highlightSlot.cohortId)
                            )

                            return (
                              <div
                                key={
                                  entry.offering_id
                                    ? `${entry.offering_id}-${realIndex}`
                                    : `${entry.cohort_id}-${entry.subject_id}-${entry.teacher_id}-${realIndex}`
                                }
                                draggable={!pinned && !readOnly}
                                onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
                                  if (pinned || readOnly) {
                                    e.preventDefault()
                                    return
                                  }
                                  e.dataTransfer.setData("text/plain", String(realIndex))
                                  e.dataTransfer.effectAllowed = "move"
                                  setDraggedIndex(realIndex)
                                }}
                                onDragEnd={() => {
                                  setDraggedIndex(null)
                                  setDragOverCell(null)
                                }}
                                onClick={() => {
                                  if (draggedIndex === null && !readOnly) {
                                    setEditingEntry({ entry, index: realIndex })
                                  }
                                }}
                                className={cn(
                                  "group relative w-full rounded-xl border p-2 text-left select-none transition-all duration-150 shadow-xs flex flex-col justify-between gap-1.5 overflow-hidden min-w-0",
                                  pinned || readOnly
                                    ? "cursor-default opacity-95"
                                    : "cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-primary/40 hover:shadow-sm",
                                  isDeepLinkHighlighted
                                    ? "ring-2 ring-warning border-warning bg-warning/20 text-warning-foreground dark:bg-warning/25 shadow-glow-primary scale-[1.02] z-10"
                                    : isConflicted
                                      ? "ring-2 ring-destructive border-destructive bg-destructive/15 text-destructive dark:bg-destructive/25 shadow-sm"
                                      : cn(color.bg, color.border, color.text),
                                  isBeingDragged && "opacity-40 scale-95 ring-2 ring-primary shadow-lg",
                                )}
                              >
                                {/* Card Header: Subject Name & Status/Lock Icons */}
                                <div className="flex items-start justify-between gap-1 w-full min-w-0">
                                  <div className="flex items-center gap-1 min-w-0 flex-1">
                                    <p className="text-xs font-bold leading-snug truncate" title={lookups.subject[entry.subject_id] ?? entry.subject_id}>
                                      {lookups.subject[entry.subject_id] ?? entry.subject_id}
                                    </p>
                                  </div>
                                  {isDeepLinkHighlighted ? (
                                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-warning bg-warning/20 border border-warning/40 px-1 py-0.2 rounded shrink-0">
                                      ⚠ ABSENCE IMPACT
                                    </span>
                                  ) : isConflicted ? (
                                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-destructive bg-destructive/20 border border-destructive/30 px-1 py-0.2 rounded shrink-0">
                                      Clash
                                    </span>
                                  ) : pinned ? (
                                    <span
                                      title="Pinned by fixed slot constraint"
                                      className="shrink-0 text-muted-foreground/80 hover:text-foreground transition-colors"
                                    >
                                      <Lock className="h-3 w-3" />
                                    </span>
                                  ) : (
                                    <span className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity">
                                      <GripVertical className="h-3 w-3" />
                                    </span>
                                  )}
                                </div>

                                {/* Faculty Assignment */}
                                <div className="flex items-center gap-1 text-[11px] font-medium opacity-90 truncate w-full min-w-0">
                                  <User className="h-3 w-3 shrink-0 opacity-70" />
                                  <span className="truncate">{lookups.teacher[entry.teacher_id] ?? entry.teacher_id}</span>
                                </div>

                                {/* Card Footer: Room & Cohort Badges */}
                                <div className="flex items-center justify-between gap-1 pt-1 border-t border-current/10 text-[10px] w-full min-w-0 overflow-hidden">
                                  <span className="flex items-center gap-0.5 font-semibold bg-background/80 dark:bg-background/90 px-1.5 py-0.5 rounded border border-border/70 min-w-0 truncate shrink">
                                    <MapPin className="h-2.5 w-2.5 opacity-70 shrink-0" />
                                    <span className="truncate">{lookups.room[entry.room_id] ?? entry.room_id}</span>
                                  </span>

                                  {cohortFilter === "all" ? (
                                    <span className="font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0 text-[9px] truncate max-w-[48%]">
                                      {entry.cohort_id}
                                    </span>
                                  ) : (
                                    <span className="text-[9px] opacity-60 font-mono shrink-0">
                                      P{entry.period + 1}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Interactive Slot Reassignment Modal */}
      {editingEntry && mounted && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Reassign Class Slot</h3>
                <p className="text-xs text-muted-foreground">Modify teacher, room, or subject for this session</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Faculty Instructor</label>
                <Select
                  value={editingEntry.entry.teacher_id}
                  onValueChange={(val) =>
                    setEditingEntry({
                      ...editingEntry,
                      entry: { ...editingEntry.entry, teacher_id: val },
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select faculty" />
                  </SelectTrigger>
                  <SelectContent>
                    {payload.teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Subject / Course</label>
                <Select
                  value={editingEntry.entry.subject_id}
                  onValueChange={(val) =>
                    setEditingEntry({
                      ...editingEntry,
                      entry: { ...editingEntry.entry, subject_id: val },
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {payload.subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Classroom / Facility</label>
                <Select
                  value={editingEntry.entry.room_id}
                  onValueChange={(val) =>
                    setEditingEntry({
                      ...editingEntry,
                      entry: { ...editingEntry.entry, room_id: val },
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select room" />
                  </SelectTrigger>
                  <SelectContent>
                    {payload.rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name || r.id} (Cap: {r.capacity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-3 border-t border-border flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="rounded-lg px-3.5 py-1.5 text-xs font-semibold hover:bg-muted text-muted-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = schedule.map((item, idx) =>
                    idx === editingEntry.index ? { ...editingEntry.entry } : { ...item },
                  )
                  onScheduleChange(next)
                  setEditingEntry(null)
                  toast.success("Class slot successfully updated")
                }}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
