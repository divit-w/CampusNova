"use client"

import { motion } from "framer-motion"
import { ClipboardList, Filter } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/states"
import { useAttendanceSummary } from "@/lib/use-attendance-summary"
import { riseItem, staggerContainer } from "@/lib/motion"
import { cn } from "@/lib/utils"

const VALID_FILTERS = ["all", "present", "absent", "excused", "unmarked"] as const
export type AttendanceFilter = (typeof VALID_FILTERS)[number]

/** Per-student present/absent status badges for today, sourced from /admin/attendance/summary. */
export function RosterStatusList({
  date,
  filter = "all",
  onFilterChange,
}: {
  date?: string
  filter?: string
  onFilterChange?: (filter: AttendanceFilter) => void
}) {
  const { data, isLoading } = useAttendanceSummary(true, date)

  const showLoading = isLoading || !data
  const activeFilter: AttendanceFilter = VALID_FILTERS.includes(filter as AttendanceFilter)
    ? (filter as AttendanceFilter)
    : "all"

  const filteredRecords = (data?.records || []).filter((r: any) => {
    const isExcused = (r.excused || 0) > 0 || (r.leave || 0) > 0
    const isPresent = r.present > 0 && !isExcused
    const isAbsent = r.absent > 0 && r.present === 0 && !isExcused

    if (activeFilter === "present") return isPresent
    if (activeFilter === "absent") return isAbsent
    if (activeFilter === "excused") return isExcused
    if (activeFilter === "unmarked") return false
    return true
  })

  const filterTabs: { key: AttendanceFilter; label: string; count?: number }[] = [
    { key: "all", label: "All", count: data?.records.length },
    { key: "present", label: "Present", count: data?.present },
    { key: "absent", label: "Absent", count: data?.absent },
    { key: "excused", label: "Excused", count: data?.excused },
    { key: "unmarked", label: "Unmarked", count: data?.unmarked },
  ]

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-muted-foreground">
              <ClipboardList className="h-[18px] w-[18px]" />
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight">Daily status</p>
              <p className="text-xs text-muted-foreground">{showLoading ? "Loading…" : data?.date}</p>
            </div>
          </div>
          {!showLoading && data && (
            <Badge variant="neutral">
              {data.records.length} of {data.rosterTotal}
              {data.rosterCapped ? "+" : ""} marked
            </Badge>
          )}
        </div>

        {/* Compact Filter Controls */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {filterTabs.map((tab) => {
            const isTabActive = activeFilter === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onFilterChange?.(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                  isTabActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                      isTabActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto p-3">
        {showLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : !data.isWorkingDay && data.records.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No attendance scheduled today"
            description="Today is a scheduled non-academic day / weekend. No student attendance is scheduled."
          />
        ) : activeFilter === "unmarked" ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              {data.unmarked} student{data.unmarked === 1 ? "" : "s"} unmarked for {data.date}.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Process a register sheet or wait for edge-node clock-ins to mark attendance.
            </p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={activeFilter === "all" ? "No attendance marked yet" : `No ${activeFilter} students found`}
            description={
              activeFilter === "all"
                ? "Process a register sheet or wait for edge-node sync to see today's status here."
                : `There are currently no students marked as ${activeFilter} for this date.`
            }
          />
        ) : (
          <motion.ul variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-1">
            {filteredRecords.map((r: any) => {
              const isExcused = (r.excused || 0) > 0 || (r.leave || 0) > 0
              const present = r.present > 0 && !isExcused
              return (
                <motion.li
                  key={r.student_id}
                  variants={riseItem}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-accent"
                >
                  <span className="text-sm font-medium tabular-nums">{r.student_id}</span>
                  {isExcused ? (
                    <Badge variant="warning" className="bg-warning/20 text-warning-foreground hover:bg-warning/30 border-none">
                      Excused Leave
                    </Badge>
                  ) : (
                    <Badge variant={present ? "success" : "destructive"}>{present ? "Present" : "Absent"}</Badge>
                  )}
                </motion.li>
              )
            })}
          </motion.ul>
        )}
      </div>
    </Card>
  )
}
