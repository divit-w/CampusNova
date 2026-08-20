"use client"

import useSWR from "swr"
import { motion } from "framer-motion"
import { CalendarDays, BookOpen, Clock, GraduationCap } from "lucide-react"

import { api } from "@/lib/api"
import type { ClassResponse } from "@/lib/types"
import { useAuth } from "@/lib/auth"
import { getSubjectColor } from "@/lib/subject-color"
import { listContainer, listItem } from "@/lib/motion"
import { PageHeading, EmptyState, ErrorState } from "@/components/states"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function MySchedulePage() {
  const { user } = useAuth()

  // Wired live to GET /portals/teacher/my-classes (audit P1-6, option b).
  const { data, error, isLoading } = useSWR<ClassResponse[]>(
    "/portals/teacher/my-classes",
    (path: string) => api.get<ClassResponse[]>(path),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeading
        icon={<CalendarDays className="h-5 w-5" />}
        title="My Schedule"
        description={
          user
            ? `Welcome, ${user.full_name}. Here are the classes currently assigned to you.`
            : "Your assigned classes."
        }
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-6 w-40" />
              <Skeleton className="mt-2 h-4 w-32" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-2">
          <ErrorState error={error} />
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
                <Card className="h-full p-4 transition-shadow hover:shadow-soft-lg">
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
  )
}
