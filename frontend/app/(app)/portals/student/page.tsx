"use client"

import useSWR from "swr"
import { motion } from "framer-motion"
import { BellRing, BookOpen, CalendarDays, Clock, GraduationCap, Radio, ShieldCheck } from "lucide-react"

import { api } from "@/lib/api"
import type { ClassResponse, StudentAttendanceSummaryResponse } from "@/lib/types"
import { useAuth } from "@/lib/auth"
import { useAlerts } from "@/lib/alerts"
import { getSubjectColor } from "@/lib/subject-color"
import { listContainer, listItem, riseItem, staggerContainer } from "@/lib/motion"
import { PageHeading, EmptyState, ErrorState } from "@/components/states"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

function relativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

/** Tone thresholds keep the bar within the app's 3 established accent colors. */
function attendanceTone(percentage: number) {
  if (percentage >= 90) return { bar: "bg-success", tint: "bg-success/10", text: "text-success" }
  if (percentage >= 75) return { bar: "bg-primary", tint: "bg-primary/10", text: "text-primary" }
  return { bar: "bg-warning", tint: "bg-warning/15", text: "text-[hsl(30_60%_28%)]" }
}

function AttendanceCard() {
  const { data, error, isLoading } = useSWR<StudentAttendanceSummaryResponse>(
    "/portals/student/attendance-summary",
    (path: string) => api.get<StudentAttendanceSummaryResponse>(path),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="mt-4 h-7 w-20" />
        <Skeleton className="mt-2 h-3.5 w-32" />
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="p-2">
        <ErrorState error={error} />
      </Card>
    )
  }

  const percentage = data?.percentage ?? 0
  const hasRecords = (data?.total ?? 0) > 0
  const tone = attendanceTone(percentage)

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5">
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl", tone.tint, tone.text)}>
          <ShieldCheck className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="text-sm font-semibold leading-tight">Attendance</p>
          <p className="text-xs text-muted-foreground">All-time record</p>
        </div>
      </div>

      {hasRecords ? (
        <>
          <p className="mt-4 text-2xl font-semibold tracking-tight tabular-nums">{percentage}%</p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(percentage, 100)}%` }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className={cn("h-full rounded-full", tone.bar)}
            />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {data?.present} present · {data?.absent} absent · {data?.total} total days
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No attendance has been recorded for you yet. Your percentage will appear here once your teacher marks it.
        </p>
      )}
    </Card>
  )
}

export default function StudentPortalPage() {
  const { user } = useAuth()
  const { status, feed } = useAlerts()
  const firstName = user?.full_name?.split(" ")[0] ?? "there"

  // Wired live to GET /portals/student/my-schedule — resolved server-side from
  // the student's own grade + section.
  const { data, error, isLoading, mutate } = useSWR<ClassResponse[]>(
    "/portals/student/my-schedule",
    (path: string) => api.get<ClassResponse[]>(path),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  return (
    <div>
      <PageHeading
        icon={<GraduationCap className="h-5 w-5" />}
        title={`Good to see you, ${firstName}.`}
        description="Your class schedule, attendance record, and the latest school alerts."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Class schedule */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {data && data.length > 0 ? `${data.length} class${data.length === 1 ? "" : "es"} on your timetable` : "Your class schedule"}
            </h3>
          </div>

          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="p-4">
                  <Skeleton className="h-9 w-9 rounded-xl" />
                  <Skeleton className="mt-3 h-5 w-32" />
                  <Skeleton className="mt-2 h-4 w-24" />
                </Card>
              ))}
            </div>
          ) : error ? (
            <Card className="p-2">
              <ErrorState error={error} onRetry={() => mutate()} />
            </Card>
          ) : !data || data.length === 0 ? (
            <Card>
              <EmptyState
                icon={CalendarDays}
                title="No classes scheduled yet"
                description="Once an administrator assigns classes to your grade and section, they'll appear here."
              />
            </Card>
          ) : (
            <motion.div
              variants={listContainer}
              initial="hidden"
              animate="show"
              className="grid gap-3 sm:grid-cols-2"
            >
              {data.map((cls) => {
                const color = getSubjectColor(cls.subject)
                return (
                  <motion.div key={cls.class_id} variants={listItem}>
                    <Card className="h-full p-4 transition-shadow duration-300 hover:shadow-soft-lg">
                      <div className="flex items-start justify-between gap-2">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${color.bg} ${color.text}`}>
                          <BookOpen className="h-4 w-4" />
                        </span>
                        <Badge variant="neutral" className="font-mono text-[11px]">
                          {cls.class_id}
                        </Badge>
                      </div>
                      <h3 className="mt-3 text-base font-semibold text-foreground">{cls.subject}</h3>
                      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                        <p className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {cls.schedule_time}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <GraduationCap className="h-3.5 w-3.5" />
                          Grade {cls.grade} · Section {cls.section}
                        </p>
                      </div>
                    </Card>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </div>

        {/* Sidebar — attendance + alerts */}
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
          <motion.div variants={riseItem}>
            <AttendanceCard />
          </motion.div>

          <motion.div variants={riseItem}>
            <Card className="flex flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-border p-5">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-live/10 text-live">
                    <Radio className="h-[18px] w-[18px]" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold leading-tight">School Alerts</p>
                    <p className="text-xs text-muted-foreground">Live updates for your campus</p>
                  </div>
                </div>
                <Badge variant={status === "connected" ? "live" : "warning"}>
                  {status === "connected" ? "Connected" : status === "reconnecting" ? "Reconnecting" : "Connecting"}
                </Badge>
              </div>

              <div className="max-h-[320px] flex-1 overflow-y-auto">
                {feed.length === 0 ? (
                  <EmptyState
                    icon={BellRing}
                    title="No alerts yet"
                    description="Substitute assignments and school-wide announcements will appear here in real time."
                  />
                ) : (
                  <motion.ul variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-1 p-3">
                    {feed.map((item) => (
                      <motion.li
                        key={item.id}
                        variants={riseItem}
                        className="flex gap-3 rounded-xl p-3 transition-colors hover:bg-accent"
                      >
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-live" />
                        <div className="min-w-0">
                          <p className="text-pretty text-sm leading-snug">{item.message}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{relativeTime(item.receivedAt)}</p>
                        </div>
                      </motion.li>
                    ))}
                  </motion.ul>
                )}
              </div>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
