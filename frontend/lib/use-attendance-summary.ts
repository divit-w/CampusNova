"use client"

import useSWR from "swr"
import { api } from "./api"

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Derives today's Present / Absent / Unmarked headcounts from two real
 * endpoints: the admin attendance aggregation and the student roster.
 * Unmarked = roster size minus every student with a present or absent
 * record today — the closest honest proxy for "on leave / unaccounted"
 * since the backend does not track a dedicated leave status.
 */
export function useAttendanceSummary(enabled: boolean) {
  const date = todayIso()

  const { data, error, isLoading, mutate } = useSWR(
    enabled ? ["attendance-kpis", date] : null,
    async () => {
      const [summary, roster] = await Promise.all([api.attendanceSummary(date), api.roster(100)])
      const present = summary.records.filter((r) => r.present > 0).length
      const absent = summary.records.filter((r) => r.absent > 0 && r.present === 0).length
      const rosterTotal = roster.length
      const unmarked = Math.max(rosterTotal - (present + absent), 0)
      return {
        date: summary.date,
        present,
        absent,
        unmarked,
        rosterTotal,
        rosterCapped: rosterTotal === 100,
        records: summary.records,
      }
    },
    { refreshInterval: 60_000, revalidateOnFocus: false },
  )

  return { data, error, isLoading, mutate }
}
