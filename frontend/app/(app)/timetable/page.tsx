"use client"

import { Suspense, useState, useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import useSWR from "swr"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle,
  CalendarRange,
  Download,
  Play,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  ArrowLeft,
  UserX,
  CheckCircle2,
  ShieldCheck,
  Zap,
  ChevronRight,
  SlidersHorizontal,
  FileCheck2,
  Eye,
  Lock,
} from "lucide-react"
import { toast } from "sonner"
import { ConstraintBuilder } from "@/components/timetable/constraint-builder"
import { AlgorithmExplainer } from "@/components/timetable/algorithm-explainer"
import { ConflictSummaryBanner } from "@/components/timetable/conflict-summary-banner"
import { ResolutionProofCard } from "@/components/timetable/resolution-proof-card"
import { exportTimetablePDF } from "@/lib/timetable-pdf"

import { api } from "@/lib/api"
import type {
  TimetablePayload,
  TimetableStatusResponse,
  ScheduleEntry,
  DetectedConflict,
  ActiveTimetableResponse,
} from "@/lib/types"
import { SAMPLE_TIMETABLE_PAYLOAD } from "@/lib/sample-timetable"
import { CONFLICTED_TIMETABLE_PAYLOAD, CONFLICTED_RAW_SCHEDULE } from "@/lib/conflicted-timetable-dataset"
import { detectScheduleConflicts } from "@/lib/conflict-detector"
import { PageHeading } from "@/components/states"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

function buildPayloadFromEntities(entities: any): TimetablePayload {
  const daysPerWeek = entities?.settings?.working_days || 5
  const periodsPerDay = entities?.settings?.periods_per_day || 6

  const teachers = (entities?.teachers || []).map((t: any) => ({
    id: t.teacher_id || t.id,
    name: t.full_name || t.name || t.teacher_id,
    max_hours: t.weekly_capacity || t.max_hours || 20,
    blocked_slots: t.blocked_slots || t.blocked_periods || [],
  }))

  const cohorts = (entities?.cohorts || []).map((c: any) => ({
    id: c.class_id || c.cohort_id || c.id,
    name: c.name || c.class_id || c.cohort_id,
    student_count: c.capacity || c.student_count || 40,
    blocked_slots: c.blocked_slots || [],
  }))

  const rooms = (entities?.rooms || []).map((r: any) => ({
    id: r.room_id || r.id,
    name: r.name || r.room_id || r.id,
    capacity: r.capacity || 40,
    room_type: r.room_type || r.type || "lecture",
  }))

  const subjects = (entities?.subjects || []).map((s: any) => ({
    id: s.subject_id || s.id,
    name: s.name || s.subject_id,
    room_type: s.room_type || "lecture",
  }))

  const courseOfferings = (entities?.subjects || []).map((s: any) => {
    const sId = s.subject_id || s.id
    const cId = s.cohort_id || s.class_id || (cohorts[0]?.id ?? "C1")
    const tId = s.teacher_id || s.faculty_id || (teachers[0]?.id ?? "T1")
    const hrs = s.weekly_hours || s.weekly_sessions || s.required_weekly_hours || 3
    return {
      id: `OFF_${cId}_${sId}`,
      cohort_id: cId,
      subject_id: sId,
      required_weekly_hours: hrs,
      qualified_teacher_ids: [tId],
    }
  })

  return {
    days_per_week: daysPerWeek,
    periods_per_day: periodsPerDay,
    teachers,
    cohorts,
    rooms,
    subjects,
    course_offerings: courseOfferings,
    hard_constraints: [
      "no_double_booking",
      "max_hours_respected",
      "qualified_faculty_only",
      "room_capacity_respected",
      "blocked_slots_respected",
    ],
    fixed_slots: [],
    weight_faculty_gaps: 1.0,
    weight_subject_spread: 2.0,
  }
}

const TimetableGrid = dynamic(
  () => import("@/components/timetable-grid").then((m) => m.TimetableGrid),
  { loading: () => <Skeleton className="h-64 w-full rounded-xl" /> },
)

function InfeasibilityGuidanceCard({ errorDetail }: { errorDetail: string }) {
  return (
    <div className="flex flex-col gap-4 px-4 py-8">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">
            No Feasible Schedule Found
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Solver status: {errorDetail}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-destructive/20 bg-destructive/[0.04] p-4 text-sm">
        <p className="font-medium text-foreground">Remediation steps to achieve feasibility:</p>
        <ul className="mt-2 space-y-1.5 text-muted-foreground text-xs">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-destructive">→</span>
            <span>
              <strong className="text-foreground">Relax fixed faculty slots</strong> — remove
              over-constrained pinned teacher assignments.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-destructive">→</span>
            <span>
              <strong className="text-foreground">Allocate additional rooms</strong> — add
              more lecture halls if multiple cohorts need simultaneous slots.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-destructive">→</span>
            <span>
              <strong className="text-foreground">Reduce weekly required hours</strong> —
              ensure total cohort course hours fit within available periods per week.
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}

function TimetableContent() {
  const searchParams = useSearchParams()
  const facultyParam = searchParams.get("faculty") || searchParams.get("teacher_id")
  const periodParam = searchParams.get("period")
  const cohortParam = searchParams.get("cohort")
  const dateParam = searchParams.get("date")

  const parsedPeriod = useMemo(() => {
    if (!periodParam) return undefined
    const clean = periodParam.trim().toUpperCase()
    if (clean.startsWith("P")) {
      const num = parseInt(clean.slice(1), 10)
      return isNaN(num) ? undefined : num - 1
    }
    const directNum = parseInt(clean, 10)
    return isNaN(directNum) ? undefined : directNum
  }, [periodParam])

  const parsedDay = useMemo(() => {
    if (!dateParam) return undefined
    try {
      const dt = new Date(dateParam)
      if (isNaN(dt.getTime())) return undefined
      const day = dt.getDay()
      return day === 0 ? 6 : day - 1
    } catch {
      return undefined
    }
  }, [dateParam])

  const [mode, setMode] = useState<"landing" | "demo" | "builder">("landing")
  const [lifecycleState, setLifecycleState] = useState<
    "NO_TIMETABLE" | "DRAFT" | "VALIDATING" | "SOLVING" | "SOLVED" | "ACTIVE" | "FAILED"
  >("NO_TIMETABLE")

  const [draft, setDraft] = useState<TimetablePayload>(SAMPLE_TIMETABLE_PAYLOAD)
  const [submitted, setSubmitted] = useState<TimetablePayload | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [isActivating, setIsActivating] = useState(false)
  const [isConflictMenuOpen, setIsConflictMenuOpen] = useState(false)

  const [currentSchedule, setCurrentSchedule] = useState<ScheduleEntry[]>([])
  const [cohortFilter, setCohortFilter] = useState<string>("all")

  const [conflicts, setConflicts] = useState<DetectedConflict[]>([])
  const [pendingConflictCount, setPendingConflictCount] = useState<number | null>(null)
  const [resolvedDemoMetrics, setResolvedDemoMetrics] = useState<{
    beforeCount: number
    afterCount: number
    solveTimeMs?: number
  } | null>(null)

  const [savedBeforeSchedule, setSavedBeforeSchedule] = useState<ScheduleEntry[] | null>(null)
  const [savedBeforeConflicts, setSavedBeforeConflicts] = useState<DetectedConflict[]>([])
  const [savedSolvedSchedule, setSavedSolvedSchedule] = useState<ScheduleEntry[] | null>(null)
  const [viewMode, setViewMode] = useState<"before" | "after">("after")

  const { user } = useAuth()
  const { data: initialActive, mutate: mutateActive } = useSWR<ActiveTimetableResponse>(
    "/timetable/active",
    () => api.getActiveTimetable(),
    { revalidateOnFocus: false }
  )
  const { data: tenantEntities } = useSWR<any>(
    "/timetable/entities",
    () => api.get<any>("/timetable/entities"),
    { revalidateOnFocus: false }
  )

  useEffect(() => {
    if (initialActive?.is_active && initialActive.schedule.length > 0) {
      setCurrentSchedule(initialActive.schedule)
      setSavedSolvedSchedule(initialActive.schedule)
      setSubmitted(initialActive.payload || SAMPLE_TIMETABLE_PAYLOAD)
      setDraft(initialActive.payload || SAMPLE_TIMETABLE_PAYLOAD)
      setLifecycleState("ACTIVE")
      setMode("builder")
      if (cohortParam) {
        setCohortFilter(cohortParam)
      } else if (initialActive.payload?.cohorts?.[0]) {
        setCohortFilter(initialActive.payload.cohorts[0].id)
      }
    } else if (facultyParam) {
      setMode("demo")
      setDraft(CONFLICTED_TIMETABLE_PAYLOAD)
      setSubmitted(CONFLICTED_TIMETABLE_PAYLOAD)
      setCurrentSchedule(CONFLICTED_RAW_SCHEDULE)
      setLifecycleState("DRAFT")
      if (cohortParam) setCohortFilter(cohortParam)
    } else if (!user?.is_demo && tenantEntities && tenantEntities.counts?.teachers > 0) {
      const payloadFromTenant = buildPayloadFromEntities(tenantEntities)
      setDraft(payloadFromTenant)
      setSubmitted(payloadFromTenant)
    }
  }, [initialActive, facultyParam, cohortParam, user?.is_demo, tenantEntities])

  const highlightSlot = useMemo(() => {
    if (!facultyParam) return null
    return {
      teacherId: facultyParam,
      period: parsedPeriod,
      day: parsedDay !== undefined && parsedDay >= 0 && parsedDay < 5 ? parsedDay : undefined,
      cohortId: cohortParam || undefined,
    }
  }, [facultyParam, parsedPeriod, parsedDay, cohortParam])

  const { data: job, error: pollError } = useSWR<TimetableStatusResponse>(
    jobId ? `/timetable/status/${jobId}` : null,
    (path: string) => api.get<TimetableStatusResponse>(path),
    {
      refreshInterval: (latest) => (latest?.status === "processing" ? 1000 : 0),
      revalidateOnFocus: false,
      shouldRetryOnError: true,
      errorRetryInterval: 1500,
      errorRetryCount: 5,
    },
  )

  useEffect(() => {
    if (job?.status === "completed" && job.result?.schedule) {
      const solvedSchedule = job.result.schedule
      setCurrentSchedule(solvedSchedule)
      setSavedSolvedSchedule(solvedSchedule)
      setViewMode("after")
      setLifecycleState("SOLVED")

      const payloadToUse = submitted || draft
      const afterConflicts = detectScheduleConflicts(solvedSchedule, payloadToUse)
      const beforeCount = pendingConflictCount ?? savedBeforeConflicts.length
      
      setResolvedDemoMetrics({
        beforeCount: beforeCount > 0 ? beforeCount : 0,
        afterCount: afterConflicts.length,
        solveTimeMs: job.result.solve_time_ms,
      })
      setConflicts(afterConflicts)
      setPendingConflictCount(null)

      if (submitted?.cohorts && submitted.cohorts.length > 0) {
        setCohortFilter(submitted.cohorts[0].id)
      } else {
        setCohortFilter("all")
      }
      toast.success("CP-SAT solver produced a verified conflict-free schedule!")
    } else if (job?.status === "failed") {
      setLifecycleState("FAILED")
    }
  }, [job?.status, job?.result, submitted, pendingConflictCount, draft, savedBeforeConflicts.length])

  function startDemoMode() {
    setMode("demo")
    setLifecycleState("DRAFT")
    setJobId(null)
    setDraft(CONFLICTED_TIMETABLE_PAYLOAD)
    setSubmitted(CONFLICTED_TIMETABLE_PAYLOAD)
    setCurrentSchedule(CONFLICTED_RAW_SCHEDULE)
    setSavedBeforeSchedule(CONFLICTED_RAW_SCHEDULE)
    setSavedSolvedSchedule(null)
    setViewMode("before")
    setCohortFilter("all")
    setResolvedDemoMetrics(null)
    setPendingConflictCount(null)
    const detected = detectScheduleConflicts(CONFLICTED_RAW_SCHEDULE, CONFLICTED_TIMETABLE_PAYLOAD)
    setConflicts(detected)
    setSavedBeforeConflicts(detected)
  }

  function startBuilderMode() {
    setMode("builder")
    setJobId(null)
    setConflicts([])
    setResolvedDemoMetrics(null)
    setPendingConflictCount(null)
    setSavedBeforeSchedule(null)
    setSavedBeforeConflicts([])
    setSavedSolvedSchedule(null)
    setViewMode("after")
    if (lifecycleState !== "ACTIVE") {
      const defaultPayload = (!user?.is_demo && tenantEntities && tenantEntities.counts?.teachers > 0)
        ? buildPayloadFromEntities(tenantEntities)
        : SAMPLE_TIMETABLE_PAYLOAD
      setDraft(defaultPayload)
      setSubmitted(defaultPayload)
      setLifecycleState("DRAFT")
    }
  }

  async function runSolver() {
    const parsed = draft
    setLifecycleState("SOLVING")

    const beforeCount =
      conflicts.length > 0
        ? conflicts.length
        : savedBeforeConflicts.length > 0
          ? savedBeforeConflicts.length
          : null

    setPendingConflictCount(beforeCount)
    if (beforeCount) {
      setResolvedDemoMetrics(null)
    }

    setJobId(null)
    setSubmitted(null)

    try {
      const res = await api.optimizeTimetable(parsed)
      setSubmitted(parsed)
      setJobId(res.job_id)
    } catch (err) {
      setLifecycleState("FAILED")
      setPendingConflictCount(null)
    }
  }

  async function validateDraft() {
    try {
      const payloadToUse = draft
      const scheduleToValidate = currentSchedule.length > 0 ? currentSchedule : []
      const detected = detectScheduleConflicts(scheduleToValidate, payloadToUse)
      setConflicts(detected)
      if (detected.length === 0) {
        toast.success("Schedule verified: 0 hard constraint collisions detected.")
      } else {
        toast.warning(`Validation detected ${detected.length} scheduling conflicts.`)
      }
    } catch {
      toast.error("Failed to run schedule validator.")
    }
  }

  function injectIntentionalConflict(type: "faculty" | "room" | "cohort") {
    if (currentSchedule.length === 0) {
      toast.info("Loading baseline schedule to introduce intentional conflict...")
      setCurrentSchedule(CONFLICTED_RAW_SCHEDULE)
    }

    let modified = [...(currentSchedule.length > 0 ? currentSchedule : CONFLICTED_RAW_SCHEDULE)]
    
    if (type === "faculty") {
      modified = modified.map((e) => {
        if (e.cohort_id === "CSE-B" && e.day === 0 && e.period === 1) {
          return { ...e, teacher_id: "F01" }
        }
        return e
      })
      toast.error("Intentional Conflict Injected: Dr. Sharma assigned to CSE-A & CSE-B simultaneously on Mon P2.")
    } else if (type === "room") {
      modified = modified.map((e) => {
        if (e.cohort_id === "CSE-B" && e.day === 0 && e.period === 2) {
          return { ...e, room_id: "R101" }
        }
        return e
      })
      toast.error("Intentional Conflict Injected: LH-101 double-booked on Mon P3.")
    } else if (type === "cohort") {
      modified = modified.map((e, idx) => {
        if (idx === 0) {
          return { ...e, day: 1, period: 1 }
        }
        return e
      })
      toast.error("Intentional Conflict Injected: CSE-A has two classes scheduled at Tue P2.")
    }

    setCurrentSchedule(modified)
    setSavedBeforeSchedule(modified)
    setViewMode("before")
    const detected = detectScheduleConflicts(modified, draft)
    setConflicts(detected)
    setSavedBeforeConflicts(detected)
    setPendingConflictCount(detected.length)
  }

  async function activateTimetable() {
    if (!currentSchedule || currentSchedule.length === 0) {
      toast.error("Cannot activate an empty timetable.")
      return
    }
    setIsActivating(true)
    try {
      await api.activateTimetable({
        job_id: jobId || undefined,
        schedule: currentSchedule,
        payload: draft,
      })
      setLifecycleState("ACTIVE")
      await mutateActive()
      toast.success("Timetable activated as the canonical university schedule!")
    } catch (err: any) {
      toast.error(err?.message || "Failed to activate timetable.")
    } finally {
      setIsActivating(false)
    }
  }

  const isProcessing = !!jobId && (job?.status === "processing" || (!job?.status && !pollError))
  const isDone = job?.status === "completed" || job?.status === "failed"

  const displayResult = useMemo(() => {
    if (viewMode === "before") {
      return { status: "CONFLICTED", schedule: currentSchedule }
    }
    if (job?.result) {
      return job.result
    }
    if (lifecycleState === "ACTIVE" && currentSchedule.length > 0) {
      return { status: "OPTIMAL", schedule: currentSchedule }
    }
    return null
  }, [viewMode, job?.result, lifecycleState, currentSchedule])

  const activeConflictIndices = useMemo(() => {
    if (viewMode === "before") {
      const indices = new Set<number>()
      const activeConf =
        savedBeforeConflicts.length > 0
          ? savedBeforeConflicts
          : conflicts
      activeConf.forEach((c) => c.affected_entry_indices.forEach((idx) => indices.add(idx)))
      return Array.from(indices)
    }
    return []
  }, [viewMode, savedBeforeConflicts, conflicts])

  const pollErrorStr = String(
    (pollError as any)?.response?.data?.detail ||
    (pollError as any)?.detail ||
    (pollError as any)?.message ||
    pollError || ""
  )
  const isPollInfeasible = pollErrorStr.includes("INFEASIBLE") || pollErrorStr.includes("MODEL_INVALID")
  const isInfeasible =
    (isDone && job?.status === "failed" && ((job?.error?.includes("INFEASIBLE")) || (job?.error?.includes("MODEL_INVALID")))) ||
    isPollInfeasible

  if (mode === "landing" && lifecycleState === "NO_TIMETABLE") {
    return (
      <div className="space-y-8 max-w-5xl mx-auto py-6">
        <PageHeading
          icon={<CalendarRange className="h-6 w-6" />}
          title={<span className="text-gradient-brand">Timetable Workspace</span>}
          description="Create, configure, and mathematically optimize your university operations schedule using CP-SAT."
        />

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="flex flex-col justify-between p-6 border-2 border-primary/20 hover:border-primary/50 transition-all duration-300 hover:shadow-glow-primary rounded-2xl group bg-gradient-to-b from-card to-primary/[0.02]">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive group-hover:scale-105 transition-transform">
                  <ShieldAlert className="h-6 w-6" />
                </span>
                <Badge variant="destructive" className="font-semibold text-xs px-2.5 py-0.5">
                  Educational Demo
                </Badge>
              </div>

              <div>
                <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                  Try Conflict Demo
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  Explore how CP-SAT detects and resolves scheduling conflicts using a preconfigured university scenario with faculty double-booking and room collisions.
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/40 p-3.5 text-xs text-muted-foreground space-y-1.5">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Read-Only Prebuilt Scenario:</span>
                </div>
                <p>• 7 Realistic baseline scheduling collisions</p>
                <p>• 1-Click mathematical resolution with full verification metrics</p>
              </div>
            </div>

            <Button
              onClick={startDemoMode}
              className="mt-6 w-full gap-2 font-semibold h-11"
              variant="outline"
            >
              <Eye className="h-4 w-4" />
              <span>Launch Educational Demo</span>
              <ChevronRight className="h-4 w-4 ml-auto" />
            </Button>
          </Card>

          <Card className="flex flex-col justify-between p-6 border-2 border-primary/30 hover:border-primary transition-all duration-300 hover:shadow-glow-primary rounded-2xl group bg-gradient-to-b from-card to-primary/[0.04]">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                  <SlidersHorizontal className="h-6 w-6" />
                </span>
                <Badge variant="default" className="font-semibold text-xs px-2.5 py-0.5">
                  Real Administrator Mode
                </Badge>
              </div>

              <div>
                <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                  Create Your Own Timetable
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  Configure faculty, cohorts, curriculum, rooms and hard constraints, then generate, verify, and activate a production university schedule.
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/40 p-3.5 text-xs text-muted-foreground space-y-1.5">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-success" />
                  <span>University Operational Workflow:</span>
                </div>
                <p>• Full faculty directory, cohort sizing, and room constraints</p>
                <p>• Test conflict resolution on your custom dataset</p>
                <p>• Activate schedule for AI Command Center & Substitutes</p>
              </div>
            </div>

            <Button
              onClick={startBuilderMode}
              className="mt-6 w-full gap-2 font-semibold h-11"
              variant="default"
            >
              <Sparkles className="h-4 w-4" />
              <span>Open Timetable Builder</span>
              <ChevronRight className="h-4 w-4 ml-auto" />
            </Button>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {facultyParam && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3.5 text-warning-foreground shadow-xs">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-foreground">
            <UserX className="h-4 w-4 text-destructive shrink-0" />
            <span>
              Inspecting scheduled timetable slot for absent faculty <strong className="text-foreground">{facultyParam}</strong>
              {periodParam && <span className="font-mono text-xs text-muted-foreground ml-1">({periodParam})</span>}
              {cohortParam && <span className="font-mono text-xs text-muted-foreground ml-1">[{cohortParam}]</span>}
            </span>
          </div>
          <Link href={`/substitute?faculty=${encodeURIComponent(facultyParam)}${dateParam ? `&date=${encodeURIComponent(dateParam)}` : ""}`}>
            <Button size="sm" variant="default" className="gap-1.5 text-xs font-semibold h-8 shrink-0">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Substitute Resolution</span>
            </Button>
          </Link>
        </div>
      )}

      {mode === "demo" && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-amber-900 dark:text-amber-200 shadow-xs">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold">
            <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Demo Mode — Read Only</strong> · This timetable is a preconfigured conflict scenario for demonstrating CP-SAT resolution.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={startBuilderMode}
            className="gap-1.5 text-xs font-semibold h-8 shrink-0 bg-background/80"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Create Your Own Timetable</span>
          </Button>
        </div>
      )}

      <PageHeading
        icon={<CalendarRange className="h-5 w-5" />}
        title={
          <div className="flex items-center gap-3">
            <span className="text-gradient-brand">Timetable Workspace</span>
            {lifecycleState === "ACTIVE" && (
              <Badge variant="success" className="font-bold text-xs gap-1.5 py-0.5 px-2.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Active University Timetable
              </Badge>
            )}
            {mode === "demo" && (
              <Badge variant="destructive" className="font-bold text-xs gap-1.5 py-0.5 px-2.5">
                <ShieldAlert className="h-3.5 w-3.5" />
                Demo Mode
              </Badge>
            )}
          </div>
        }
        description={
          mode === "demo"
            ? "Prebuilt conflict scenario illustrating how CP-SAT resolves faculty double-bookings, room collisions, and blocked periods."
            : "Define constraints and course offerings, test conflict resolution, and activate the canonical university schedule."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {mode === "builder" && (
              <Button
                variant="outline"
                size="sm"
                onClick={startDemoMode}
                className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                <ShieldAlert className="h-4 w-4" />
                <span>Try Conflict Demo</span>
              </Button>
            )}

            {mode === "demo" && (
              <Button
                variant="default"
                size="sm"
                onClick={startBuilderMode}
                className="gap-1.5"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>Real Builder Mode</span>
              </Button>
            )}

            {mode === "builder" && (
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsConflictMenuOpen((prev) => !prev)}
                  className="gap-1.5 text-xs font-semibold"
                >
                  <Zap className="h-3.5 w-3.5 text-warning" />
                  <span>Test Conflict Resolution</span>
                </Button>
                {isConflictMenuOpen && (
                  <div
                    className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-border bg-card p-1.5 shadow-lg z-50 text-xs space-y-1"
                    onMouseLeave={() => setIsConflictMenuOpen(false)}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        injectIntentionalConflict("faculty")
                        setIsConflictMenuOpen(false)
                      }}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:bg-muted transition-colors text-foreground"
                    >
                      <UserX className="h-3.5 w-3.5 text-destructive shrink-0" />
                      <span>Faculty Double-Booking (Dr. Sharma)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        injectIntentionalConflict("room")
                        setIsConflictMenuOpen(false)
                      }}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:bg-muted transition-colors text-foreground"
                    >
                      <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0" />
                      <span>Room Double-Booking (LH-101)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        injectIntentionalConflict("cohort")
                        setIsConflictMenuOpen(false)
                      }}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:bg-muted transition-colors text-foreground"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      <span>Cohort Double-Booking (CSE-A)</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {currentSchedule.length > 0 && lifecycleState !== "ACTIVE" && mode === "builder" && (
              <Button
                variant="default"
                size="sm"
                onClick={activateTimetable}
                disabled={isActivating || isProcessing}
                className="gap-1.5 font-bold shadow-glow-primary bg-gradient-to-r from-primary to-live hover:opacity-90"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>{isActivating ? "Activating..." : "Activate Timetable"}</span>
              </Button>
            )}

            {currentSchedule.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  exportTimetablePDF({
                    payload: submitted || draft,
                    schedule: currentSchedule,
                    resultStatus: displayResult?.status || "OPTIMAL",
                    cohortFilter,
                  })
                }
                className="gap-1.5"
              >
                <Download className="h-4 w-4" />
                <span>Export PDF</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLifecycleState("NO_TIMETABLE")
                setMode("landing")
                setCurrentSchedule([])
                setSubmitted(null)
              }}
              className="gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Switch Mode</span>
            </Button>
          </div>
        }
      />

      <div className="flex flex-col lg:flex-row gap-6 w-full h-full items-start">
        <Card className="flex flex-col p-4 w-full lg:w-[340px] xl:w-[360px] shrink-0 h-[calc(100vh-12rem)] min-h-[600px] overflow-hidden">
          <div className="mb-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>{mode === "demo" ? "Preconfigured Scenario" : "University Constraints"}</span>
            </div>
            {mode === "demo" ? (
              <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                Read-Only Preset
              </Badge>
            ) : lifecycleState === "ACTIVE" ? (
              <Badge variant="success" className="text-[10px] px-2 py-0.5">
                Active Problem Spec
              </Badge>
            ) : (
              <Badge variant="neutral" className="text-[10px] px-2 py-0.5">
                Draft Mode
              </Badge>
            )}
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <ConstraintBuilder payload={draft} onChange={setDraft} />
          </div>

          <div className="shrink-0 pt-4 mt-auto border-t border-border/50 space-y-2">
            {mode === "builder" && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={validateDraft}
                  disabled={isProcessing}
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-xs font-semibold"
                >
                  <FileCheck2 className="h-3.5 w-3.5" />
                  <span>Validate</span>
                </Button>
                <Button
                  onClick={runSolver}
                  disabled={isProcessing}
                  size="sm"
                  className="w-full gap-1.5 text-xs font-bold"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>{isProcessing ? "Solving…" : "Solve CP-SAT"}</span>
                </Button>
              </div>
            )}

            {mode === "demo" && (
              <Button
                onClick={runSolver}
                disabled={isProcessing}
                className="w-full gap-1.5 font-bold bg-gradient-to-r from-primary to-live"
              >
                <Play className="h-4 w-4" />
                <span>{isProcessing ? "Solving with CP-SAT…" : "Resolve with CP-SAT"}</span>
              </Button>
            )}
          </div>
        </Card>

        <div className="flex flex-col flex-1 min-w-0 w-full gap-4">
          {isProcessing && (
            <AlgorithmExplainer />
          )}

          {conflicts.length > 0 && viewMode === "before" && (
            <ConflictSummaryBanner
              conflicts={conflicts}
              totalSessions={draft.course_offerings?.reduce((s, o) => s + o.required_weekly_hours, 0) || 24}
              onResolveClick={runSolver}
              isSolving={isProcessing}
            />
          )}

          {resolvedDemoMetrics && viewMode === "after" && (
            <ResolutionProofCard
              beforeConflictCount={resolvedDemoMetrics.beforeCount}
              afterConflictCount={resolvedDemoMetrics.afterCount}
              totalPlaced={currentSchedule.length}
              totalRequired={draft.course_offerings?.reduce((s, o) => s + o.required_weekly_hours, 0) || currentSchedule.length}
              result={displayResult || { status: "OPTIMAL", schedule: currentSchedule, solve_time_ms: resolvedDemoMetrics.solveTimeMs }}
            />
          )}

          {savedBeforeSchedule && savedSolvedSchedule && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Timeline View:</span>
                <div className="flex rounded-lg bg-muted p-1 gap-1">
                  <button
                    onClick={() => {
                      setViewMode("before")
                      setCurrentSchedule(savedBeforeSchedule)
                    }}
                    className={cn(
                      "px-3 py-1 text-xs font-bold rounded-md transition-all",
                      viewMode === "before"
                        ? "bg-destructive text-destructive-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Conflicted Schedule ({savedBeforeConflicts.length} Conflicts)
                  </button>
                  <button
                    onClick={() => {
                      setViewMode("after")
                      setCurrentSchedule(savedSolvedSchedule)
                    }}
                    className={cn(
                      "px-3 py-1 text-xs font-bold rounded-md transition-all",
                      viewMode === "after"
                        ? "bg-success text-success-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    CP-SAT Resolved (0 Collisions)
                  </button>
                </div>
              </div>

              {lifecycleState !== "ACTIVE" && mode === "builder" && (
                <Button
                  size="sm"
                  onClick={activateTimetable}
                  disabled={isActivating}
                  className="gap-1.5 text-xs font-bold"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Activate Schedule</span>
                </Button>
              )}
            </div>
          )}

          {isInfeasible && (
            <Card className="p-4 border-destructive/40 bg-destructive/5">
              <InfeasibilityGuidanceCard errorDetail={pollErrorStr || "INFEASIBLE"} />
            </Card>
          )}

          {currentSchedule.length > 0 ? (
            <TimetableGrid
              result={displayResult || { status: "OPTIMAL", schedule: currentSchedule }}
              payload={submitted || draft}
              schedule={currentSchedule}
              onScheduleChange={(newSchedule) => {
                if (mode !== "demo") {
                  setCurrentSchedule(newSchedule)
                }
              }}
              cohortFilter={cohortFilter}
              onCohortFilterChange={setCohortFilter}
              conflictEntryIndices={activeConflictIndices}
              highlightSlot={highlightSlot}
              readOnly={mode === "demo"}
            />
          ) : (
            <Card className="p-12 flex flex-col items-center justify-center text-center space-y-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <CalendarRange className="h-7 w-7" />
              </span>
              <div>
                <h3 className="text-base font-bold text-foreground">Ready to Build Timetable</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  Configure your university faculty, cohorts, and course offerings on the left, then click <strong>Solve CP-SAT</strong> to compute the schedule.
                </p>
              </div>
              <Button onClick={runSolver} className="gap-2 font-bold">
                <Play className="h-4 w-4" />
                <span>Generate Initial Schedule</span>
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TimetablePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading timetable workspace…</div>}>
      <TimetableContent />
    </Suspense>
  )
}
