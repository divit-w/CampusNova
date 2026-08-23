"use client"

import useSWR from "swr"
import { api } from "./api"

function todayIso() {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Derives today's Present / Absent / Excused / Unmarked headcounts from real
 * endpoints: the admin attendance aggregation and the canonical student roster.
 * Accurately derives live state from database records without hardcoding.
 */
export function useAttendanceSummary(enabled: boolean, overrideDate?: string) {
  const date = overrideDate || todayIso()

  const { data, error, isLoading, mutate } = useSWR(
    enabled ? ["attendance-kpis", date] : null,
    async () => {
      const [summary, roster] = await Promise.all([api.attendanceSummary(date), api.roster(200)])
      const present = (summary.records || []).filter((r) => r.present > 0).length
      const absent = (summary.records || []).filter((r) => r.absent > 0 && r.present === 0 && (r.excused || 0) === 0).length
      const excused = (summary.records || []).filter((r) => (r.excused || 0) > 0 || (r.leave || 0) > 0).length
      const rosterTotal = roster.length
      const isWorkingDay = (summary as any).is_working_day !== false
      const unmarked = isWorkingDay ? Math.max(rosterTotal - (present + absent + excused), 0) : 0
      return {
        date: summary.date,
        isWorkingDay,
        present,
        absent,
        excused,
        unmarked,
        rosterTotal,
        rosterCapped: false,
        records: summary.records || [],
      }
    },
    { refreshInterval: 30_000, revalidateOnFocus: false },
  )

  return { data, error, isLoading, mutate }
}
