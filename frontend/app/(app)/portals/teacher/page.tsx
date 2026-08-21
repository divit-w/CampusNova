"use client"

import Link from "next/link"
import useSWR from "swr"
import { motion } from "framer-motion"
import { ArrowRight, BookOpen, CalendarDays, Clock, ClipboardCheck, GraduationCap } from "lucide-react"

import { api } from "@/lib/api"
import type { ClassResponse } from "@/lib/types"
import { useAuth } from "@/lib/auth"
import { getSubjectColor } from "@/lib/subject-color"
import { listContainer, listItem, riseItem, staggerContainer } from "@/lib/motion"
import { PageHeading, EmptyState, ErrorState } from "@/components/states"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function TeacherPortalPage() {
  const { user } = useAuth()
  const firstName = user?.full_name?.split(" ")[0] ?? "there"

  // Wired live to GET /portals/teacher/my-classes — the full set of classes
  // assigned to this teacher, presented here as their daily teaching load.
  const { data, error, isLoading, mutate } = useSWR<ClassResponse[]>(
    "/portals/teacher/my-classes",
    (path: string) => api.get<ClassResponse[]>(path),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  const classCount = data?.length ?? 0

  return (
    <div>
      <PageHeading
        icon={<GraduationCap className="h-5 w-5" />}
        title={`Good to see you, ${firstName}.`}
        description="Your classes for today and quick access to the attendance workflow."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Today's classes */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {classCount > 0 ? `${classCount} class${classCount === 1 ? "" : "es"} assigned to you` : "Your classes"}
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
                title="No classes assigned yet"
                description="Once an administrator assigns classes to you, they'll appear here with their subjects and timings."
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
                    <Card className="h-full p-4 transition-all duration-300 ease-spring hover:-translate-y-0.5 hover:shadow-glow-primary">
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

        {/* Sidebar — quick actions */}
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
          <motion.div variants={riseItem}>
            <Link href="/attendance" className="group block">
              <Card className="flex flex-col gap-4 p-5 transition-all duration-300 ease-spring hover:-translate-y-1 hover:scale-[1.02] hover:shadow-glow-primary">
                <div className="flex items-start justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary/15 to-live/15 text-primary transition-transform duration-300 group-hover:scale-110">
                    <ClipboardCheck className="h-5 w-5" />
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary" />
                </div>
                <div>
                  <p className="font-semibold tracking-tight">Submit Daily Attendance</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Upload today&apos;s attendance sheet or clock in for the day via the attendance workflow.
                  </p>
                </div>
              </Card>
            </Link>
          </motion.div>

          <motion.div variants={riseItem}>
            <Card className="p-5 transition-all duration-300 ease-spring hover:-translate-y-0.5 hover:shadow-glow-cyan">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-live/15 to-primary/10 text-live">
                  <CalendarDays className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <p className="text-sm font-semibold leading-tight">Teaching load</p>
                  <p className="text-xs text-muted-foreground">Across all assigned sections</p>
                </div>
              </div>
              <p className="text-gradient-brand mt-4 text-2xl font-semibold tracking-tight tabular-nums">{classCount}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {classCount === 1 ? "class currently assigned" : "classes currently assigned"}
              </p>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
