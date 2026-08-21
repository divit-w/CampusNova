"use client"

import useSWR from "swr"
import { api } from "./api"

/**
 * Single real endpoint (GET /admin/dashboard-summary) backing the KPI row,
 * weekly attendance chart, and quick-action live statuses on the dashboard.
 * Refreshes every 60s to stay roughly in sync with the live alert feed.
 */
export function useDashboardSummary(enabled: boolean) {
  const { data, error, isLoading } = useSWR(
    enabled ? "dashboard-summary" : null,
    () => api.dashboardSummary(),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  )

  return { data, error, isLoading }
}
