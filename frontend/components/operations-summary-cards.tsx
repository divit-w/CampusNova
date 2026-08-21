"use client"

import { motion } from "framer-motion"
import { CalendarCheck2, GraduationCap, ShieldCheck, Users } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { relativeTimeFromIso } from "@/lib/format"
import { riseItem, staggerContainer } from "@/lib/motion"
import { useDashboardSummary } from "@/lib/use-dashboard-summary"
import { cn } from "@/lib/utils"

const STATUS_LABEL: Record<string, string> = {
  processing: "Generating…",
  completed: "Completed",
  failed: "Failed",
}

/**
 * Enrollment + scheduling half of the KPI band — active students/teachers,
 * the most recent timetable job status, and today's substitute assignments.
 * All four values come from GET /admin/dashboard-summary (real collections).
 */
export function OperationsSummaryCards({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = useDashboardSummary(true)

  if (isLoading && !data) {
    return (
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className={cn("p-5", compact && "p-4")}>
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="mt-4 h-7 w-16" />
            <Skeleton className="mt-2 h-3.5 w-24" />
          </Card>
        ))}
      </div>
    )
  }

  const timetableGeneratedAgo = relativeTimeFromIso(data?.timetable_generated_at)
  const timetableLabel = data?.timetable_status ? STATUS_LABEL[data.timetable_status] ?? data.timetable_status : "No jobs yet"

  const tiles = [
    {
      key: "students",
      icon: Users,
      tone: "text-primary",
      tint: "bg-primary/10",
      value: data?.active_students ?? 0,
      label: "Enrolled students",
    },
    {
      key: "teachers",
      icon: GraduationCap,
      tone: "text-live",
      tint: "bg-live/10",
      value: data?.active_teachers ?? 0,
      label: "Active faculty",
    },
    {
      key: "timetable",
      icon: CalendarCheck2,
      tone: "text-success",
      tint: "bg-success/10",
      value: timetableLabel,
      label: timetableGeneratedAgo ? `Timetable · ${timetableGeneratedAgo}` : "Timetable not generated",
    },
    {
      key: "substitutions",
      icon: ShieldCheck,
      tone: "text-warning",
      tint: "bg-warning/15",
      value: data?.substitutions_today ?? 0,
      label: "Substitutes assigned today",
    },
  ]

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid gap-4 grid-cols-2 sm:grid-cols-4"
    >
      {tiles.map((tile) => (
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
            <p className="text-gradient-brand mt-4 truncate text-2xl font-semibold tracking-tight tabular-nums">
              {tile.value}
            </p>
            <p className="mt-1 truncate text-sm text-muted-foreground">{tile.label}</p>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  )
}
