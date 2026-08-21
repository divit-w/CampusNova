"use client"

import { motion } from "framer-motion"
import { CalendarOff, UserCheck, UserX } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAttendanceSummary } from "@/lib/use-attendance-summary"
import { riseItem, staggerContainer } from "@/lib/motion"
import { cn } from "@/lib/utils"

const TILES = [
  {
    key: "present" as const,
    label: "Present today",
    icon: UserCheck,
    tone: "text-success",
    tint: "bg-success/10",
  },
  {
    key: "absent" as const,
    label: "Absent today",
    icon: UserX,
    tone: "text-destructive",
    tint: "bg-destructive/10",
  },
  {
    key: "excused" as const,
    label: "Excused / Leave",
    icon: CalendarOff,
    tone: "text-info",
    tint: "bg-info/10",
  },
  {
    key: "unmarked" as const,
    label: "Unmarked",
    icon: CalendarOff,
    tone: "text-warning",
    tint: "bg-warning/15",
  },
]

/** Real KPI row backed by /admin/attendance/summary + /admin/students. Admin-only endpoints. */
export function AttendanceKpiCards({ compact = false, date }: { compact?: boolean; date?: string }) {
  const { data, isLoading } = useAttendanceSummary(true, date)

  if (isLoading && !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-4">
        {TILES.map((t) => (
          <Card key={t.key} className={cn("p-5", compact && "p-4")}>
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="mt-4 h-7 w-16" />
            <Skeleton className="mt-2 h-3.5 w-24" />
          </Card>
        ))}
      </div>
    )
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid gap-4 sm:grid-cols-4"
    >
      {TILES.map((tile) => {
        const value = data ? data[tile.key] : 0
        return (
          <motion.div key={tile.key} variants={riseItem}>
            <Card
              className={cn(
                "p-5 transition-all duration-300 ease-spring hover:-translate-y-0.5 hover:shadow-glow-primary",
                compact && "p-4",
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn("grid h-9 w-9 place-items-center rounded-xl", tile.tint, tile.tone)}>
                  <tile.icon className="h-[18px] w-[18px]" />
                </span>
              </div>
              <p className="mt-4 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{tile.label}</p>
            </Card>
          </motion.div>
        )
      })}
    </motion.div>
  )
}
