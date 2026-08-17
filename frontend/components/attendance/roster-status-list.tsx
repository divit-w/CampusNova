"use client"

import { motion } from "framer-motion"
import { ClipboardList } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/states"
import { useAttendanceSummary } from "@/lib/use-attendance-summary"
import { riseItem, staggerContainer } from "@/lib/motion"

/** Per-student present/absent status badges for today, sourced from /admin/attendance/summary. */
export function RosterStatusList({ date }: { date?: string }) {
  const { data, isLoading } = useAttendanceSummary(true, date)

  const showLoading = isLoading || !data

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-5">
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

      <div className="max-h-[420px] overflow-y-auto p-3">
        {showLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : data.records.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No attendance marked yet"
            description="Process a register sheet or wait for edge-node sync to see today's status here."
          />
        ) : (
          <motion.ul variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-1">
            {data.records.map((r: any) => {
              const present = r.present > 0
              const excused = r.excused > 0
              return (
                <motion.li
                  key={r.student_id}
                  variants={riseItem}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-accent"
                >
                  <span className="text-sm font-medium tabular-nums">{r.student_id}</span>
                  {excused ? (
                    <Badge variant="warning" className="bg-warning/20 text-warning-foreground hover:bg-warning/30 border-none">Excused Leave</Badge>
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
