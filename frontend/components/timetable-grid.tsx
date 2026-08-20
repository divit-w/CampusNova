"use client"

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { CheckCircle2, AlertTriangle, Info } from "lucide-react"

import type { TimetablePayload, ScheduleEntry, TimetableResult } from "@/lib/types"
import { getSubjectColor } from "@/lib/subject-color"
import { spring } from "@/lib/motion"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

interface Lookups {
  teacher: Record<string, string>
  room: Record<string, string>
  subject: Record<string, string>
  cohort: Record<string, string>
}

/** Explainability summary derived from the solver status + submitted constraints (P1-5). */
function Explainability({
  result,
  payload,
}: {
  result: TimetableResult
  payload: TimetablePayload
}) {
  const optimal = result.status === "OPTIMAL"
  const feasible = result.status === "FEASIBLE"
  const totalRequired = payload.cohorts.length
    ? payload.subjects.reduce((sum, s) => sum + s.required_weekly_hours, 0) * payload.cohorts.length
    : payload.subjects.reduce((sum, s) => sum + s.required_weekly_hours, 0)
  const placed = result.schedule.length

  return (
    <div className="flex flex-wrap items-center gap-2">
      {optimal && (
        <Badge variant="success" className="gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Optimal solution
        </Badge>
      )}
      {feasible && (
        <Badge variant="warning" className="gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          Feasible (not proven optimal)
        </Badge>
      )}
      <Badge variant="neutral" className="gap-1.5">
        <Info className="h-3.5 w-3.5" />
        {placed} / {totalRequired} sessions placed
      </Badge>
      {payload.hard_constraints.map((hc) => (
        <Badge key={hc} variant="success" className="gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {hc.replace(/_/g, " ")}
        </Badge>
      ))}
    </div>
  )
}

export function TimetableGrid({
  result,
  payload,
}: {
  result: TimetableResult
  payload: TimetablePayload
}) {
  const lookups: Lookups = useMemo(
    () => ({
      teacher: Object.fromEntries(payload.teachers.map((t) => [t.id, t.name])),
      room: Object.fromEntries(payload.rooms.map((r) => [r.id, r.id])),
      subject: Object.fromEntries(payload.subjects.map((s) => [s.id, s.name])),
      cohort: Object.fromEntries(payload.cohorts.map((c) => [c.id, c.name])),
    }),
    [payload],
  )

  const [cohortFilter, setCohortFilter] = useState<string>(payload.cohorts[0]?.id ?? "all")

  const cells = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>()
    for (const entry of result.schedule) {
      if (cohortFilter !== "all" && entry.cohort_id !== cohortFilter) continue
      const key = `${entry.day}-${entry.period}`
      const list = map.get(key) ?? []
      list.push(entry)
      map.set(key, list)
    }
    return map
  }, [result.schedule, cohortFilter])

  const days = Array.from({ length: payload.days_per_week }, (_, i) => i)
  const periods = Array.from({ length: payload.periods_per_day }, (_, i) => i)

  const subjectsInView = useMemo(() => {
    const ids = new Set<string>()
    result.schedule.forEach((e) => {
      if (cohortFilter === "all" || e.cohort_id === cohortFilter) ids.add(e.subject_id)
    })
    return Array.from(ids)
  }, [result.schedule, cohortFilter])

  return (
    <div className="space-y-5">
      <Explainability result={result} payload={payload} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {subjectsInView.map((sid) => {
            const c = getSubjectColor(sid)
            return (
              <span key={sid} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("h-2.5 w-2.5 rounded-full", c.dot)} />
                {lookups.subject[sid] ?? sid}
              </span>
            )
          })}
        </div>
        {payload.cohorts.length > 1 && (
          <div className="w-48">
            <Select value={cohortFilter} onValueChange={setCohortFilter}>
              <SelectTrigger aria-label="Filter by cohort">
                <SelectValue placeholder="Filter by cohort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cohorts</SelectItem>
                {payload.cohorts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-muted/60">
              <th className="sticky left-0 z-10 w-24 bg-muted/60 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Period
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  className="min-w-40 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {DAY_NAMES[d] ?? `Day ${d + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p} className="border-t border-border/70">
                <td className="sticky left-0 z-10 bg-card px-3 py-2 text-sm font-medium text-muted-foreground">
                  P{p + 1}
                </td>
                {days.map((d) => {
                  const entries = cells.get(`${d}-${p}`) ?? []
                  return (
                    <td key={d} className="p-1.5 align-top">
                      <div className="flex flex-col gap-1.5">
                        {entries.map((entry, i) => {
                          const color = getSubjectColor(entry.subject_id)
                          return (
                            <motion.div
                              key={`${entry.subject_id}-${entry.teacher_id}-${i}`}
                              initial={{ opacity: 0, scale: 0.96 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ ...spring.gentle, delay: (d + p) * 0.015 }}
                              className={cn(
                                "rounded-lg border px-2.5 py-1.5 text-left",
                                color.bg,
                                color.border,
                                color.text,
                              )}
                            >
                              <p className="text-xs font-semibold leading-tight">
                                {lookups.subject[entry.subject_id] ?? entry.subject_id}
                              </p>
                              <p className="mt-0.5 text-[11px] leading-tight opacity-80">
                                {lookups.teacher[entry.teacher_id] ?? entry.teacher_id}
                              </p>
                              <p className="text-[11px] leading-tight opacity-70">
                                Room {entry.room_id}
                                {cohortFilter === "all" && ` · ${lookups.cohort[entry.cohort_id] ?? entry.cohort_id}`}
                              </p>
                            </motion.div>
                          )
                        })}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
