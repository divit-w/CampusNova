"use client"

import { Suspense, useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  UserX,
  UserCheck,
  CalendarClock,
  Clock,
  Wand2,
  Radio,
  BookOpen,
  MapPin,
  Users,
  CheckCircle2,
  Sparkles,
  Loader2,
  ExternalLink,
} from "lucide-react"

import { api } from "@/lib/api"
import type {
  ResolveConflictResponse,
  FacultyScheduleResponse,
  AffectedClassSlot,
  SubstituteCandidate,
} from "@/lib/types"
import { spring, riseItem } from "@/lib/motion"
import { PageHeading, ErrorState } from "@/components/states"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

function todayIso() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
}

function SubstituteContent() {
  const searchParams = useSearchParams()
  const facultyParam = searchParams.get("faculty") || searchParams.get("teacher_id") || searchParams.get("id")
  const dateParam = searchParams.get("date")
  const periodParam = searchParams.get("period") || searchParams.get("slot")

  const [facultyList, setFacultyList] = useState<Array<{ id: string; name: string; subject: string }>>([])
  const [facultyLoading, setFacultyLoading] = useState(true)
  const [absentTeacherId, setAbsentTeacherId] = useState(() => facultyParam?.trim() || "")
  const [date, setDate] = useState(() => dateParam?.trim() || todayIso())
  const [selectedSlot, setSelectedSlot] = useState<string>(() => periodParam?.trim() || "P1")
  const [selectedSubstituteId, setSelectedSubstituteId] = useState<string>("")
  
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleData, setScheduleData] = useState<FacultyScheduleResponse | null>(null)
  
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [candidates, setCandidates] = useState<SubstituteCandidate[]>([])
  
  const [resolving, setResolving] = useState(false)
  const [resolveResult, setResolveResult] = useState<ResolveConflictResponse | null>(null)
  const [error, setError] = useState<unknown>(null)

  // Fetch tenant faculty directory dynamically
  useEffect(() => {
    let active = true
    async function loadTeachers() {
      try {
        const teachers = await api.get<any[]>("/admin/teachers")
        if (active && Array.isArray(teachers)) {
          const mapped = teachers.map((t) => ({
            id: t.teacher_id || t.id,
            name: t.full_name || t.name || t.teacher_id,
            subject: t.subject || "General",
          }))
          setFacultyList(mapped)
          if (!facultyParam && mapped.length > 0 && !absentTeacherId) {
            setAbsentTeacherId(mapped[0].id)
          }
        }
      } catch (err) {
        console.error("Failed to load faculty directory", err)
      } finally {
        if (active) setFacultyLoading(false)
      }
    }
    void loadTeachers()
    return () => {
      active = false
    }
  }, [facultyParam])

  useEffect(() => {
    if (facultyParam) {
      setAbsentTeacherId(facultyParam.trim())
    }
    if (dateParam) {
      setDate(dateParam.trim())
    }
  }, [facultyParam, dateParam])

  // Fetch timetable schedule whenever absentTeacherId or date changes
  useEffect(() => {
    let active = true
    async function loadSchedule() {
      const cleanId = absentTeacherId.trim()
      if (!cleanId) {
        setScheduleData(null)
        return
      }
      setScheduleLoading(true)
      setError(null)
      try {
        const res = await api.get<FacultyScheduleResponse>(
          `/resources/faculty-schedule/${encodeURIComponent(cleanId)}?date=${encodeURIComponent(date)}`
        )
        if (active) {
          setScheduleData(res)
          if (res.affected_classes.length > 0) {
            setSelectedSlot(res.affected_classes[0].time_slot)
          }
        }
      } catch (err) {
        if (active) setError(err)
      } finally {
        if (active) setScheduleLoading(false)
      }
    }

    loadSchedule()
    return () => {
      active = false
    }
  }, [absentTeacherId, date])

  // Automatically load ML substitute candidate recommendations for the active slot
  useEffect(() => {
    let active = true
    async function loadCandidates() {
      const cleanId = absentTeacherId.trim()
      if (!cleanId || !selectedSlot) {
        setCandidates([])
        return
      }
      setCandidatesLoading(true)
      try {
        const res = await api.get<SubstituteCandidate[]>(
          `/resources/available-substitutes?absent_teacher_id=${encodeURIComponent(cleanId)}&date=${encodeURIComponent(date)}&time_slot=${encodeURIComponent(selectedSlot)}`
        )
        if (active) {
          setCandidates(res)
        }
      } catch (err) {
        // Handled silently
      } finally {
        if (active) setCandidatesLoading(false)
      }
    }

    loadCandidates()
    return () => {
      active = false
    }
  }, [absentTeacherId, date, selectedSlot])

  async function handleAssignSubstitute(candidateId?: string) {
    const targetSubstituteId = candidateId || selectedSubstituteId || undefined
    const cleanId = absentTeacherId.trim()
    if (!cleanId || resolving) return

    setResolving(true)
    setError(null)
    try {
      const res = await api.post<ResolveConflictResponse>("/resources/resolve-conflict", {
        absent_teacher_id: cleanId,
        date,
        time_slot: selectedSlot,
        selected_substitute_id: targetSubstituteId,
      })
      setResolveResult(res)
      if (res.ranked_candidates) {
        setCandidates(res.ranked_candidates)
      }

      // Refresh schedule to update the badge
      const updatedSchedule = await api.get<FacultyScheduleResponse>(
        `/resources/faculty-schedule/${encodeURIComponent(cleanId)}?date=${encodeURIComponent(date)}`
      )
      setScheduleData(updatedSchedule)
    } catch (err) {
      setError(err)
    } finally {
      setResolving(false)
    }
  }

  const totalAffected = scheduleData?.affected_classes?.length ?? 0
  const coveredCount = scheduleData?.affected_classes?.filter((c) => !!c.assigned_substitute_id).length ?? 0
  const uncoveredCount = totalAffected - coveredCount

  const activeSlotData = scheduleData?.affected_classes.find(
    (c) => c.time_slot === selectedSlot
  )

  const displayedCandidates = resolveResult?.ranked_candidates?.length
    ? resolveResult.ranked_candidates
    : candidates

  const selectedFacultyObj = facultyList.find((f) => f.id === absentTeacherId)
  const facultyDisplayName = scheduleData?.full_name || selectedFacultyObj?.name || absentTeacherId

  // Timeline periods P1 to P5
  const timelinePeriods = [
    { code: "P1", time: "09:00", label: "Period 1" },
    { code: "P2", time: "10:00", label: "Period 2" },
    { code: "P3", time: "11:00", label: "Period 3" },
    { code: "P4", time: "12:00", label: "Period 4" },
    { code: "P5", time: "13:00", label: "Period 5" },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeading
        icon={<UserX className="h-5 w-5" />}
        title={<span className="text-gradient-brand">Substitute Resolution & Allocation</span>}
        description="Select an absent faculty member to inspect their classes today from the active timetable, evaluate ML-ranked substitute candidates, and assign coverage with live broadcast alerts."
      />

      {/* Operational Resolution Summary Banner (Success / In Progress) */}
      {!scheduleLoading && totalAffected > 0 && (
        <div
          className={cn(
            "flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 transition-all",
            uncoveredCount === 0
              ? "border-success/40 bg-success/10 text-success-foreground shadow-sm"
              : "border-warning/40 bg-warning/10 text-warning-foreground",
          )}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-xl font-bold",
                uncoveredCount === 0 ? "bg-success/20 text-success" : "bg-warning/20 text-warning",
              )}
            >
              {uncoveredCount === 0 ? <CheckCircle2 className="h-5 w-5" /> : <UserX className="h-5 w-5" />}
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">
                {uncoveredCount === 0 ? "Operational Coverage Complete" : "Coverage In Progress"}
              </p>
              <p className="text-xs text-muted-foreground">
                {uncoveredCount === 0
                  ? "All affected classes have substitute faculty assigned and broadcasted live."
                  : `${uncoveredCount} of ${totalAffected} classes require substitute assignment.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Badge variant="neutral" className="bg-background/80 px-2.5 py-1">
              {totalAffected} Affected
            </Badge>
            <Badge variant="success" className="px-2.5 py-1">
              {coveredCount} Covered
            </Badge>
            <Badge variant={uncoveredCount === 0 ? "neutral" : "destructive"} className="px-2.5 py-1">
              {uncoveredCount} Uncovered
            </Badge>
          </div>
        </div>
      )}

      {/* Operational Incident Header */}
      {!scheduleLoading && scheduleData && (
        <Card
          className={cn(
            "overflow-hidden border-2 transition-all p-5",
            totalAffected > 0
              ? "border-destructive/30 bg-destructive/[0.02]"
              : "border-border/60 bg-muted/10",
          )}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={totalAffected > 0 ? "destructive" : "neutral"}
                    className="text-[10px] font-extrabold uppercase tracking-wider"
                  >
                    {totalAffected > 0 ? "Faculty Absence Incident" : "Faculty Absence"}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground">
                    {scheduleData.day_name}, {date}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-foreground">
                  {facultyDisplayName} ({absentTeacherId}) is absent today
                </h2>
                <p className="text-xs text-muted-foreground">
                  {totalAffected > 0
                    ? `${totalAffected} ${totalAffected === 1 ? "class requires" : "classes require"} immediate coverage.`
                    : "No scheduled classes require coverage."}
                </p>
              </div>

              {totalAffected > 0 && (
                <Badge variant="outline" className="border-destructive/40 text-destructive text-xs font-semibold shrink-0">
                  {uncoveredCount} Action Required
                </Badge>
              )}
            </div>

            {totalAffected > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
                {scheduleData.affected_classes.map((cls) => {
                  const isCovered = !!cls.assigned_substitute_id
                  return (
                    <div
                      key={cls.time_slot}
                      onClick={() => setSelectedSlot(cls.time_slot)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-all cursor-pointer",
                        selectedSlot === cls.time_slot
                          ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/40 font-semibold"
                          : isCovered
                            ? "border-success/30 bg-success/5 text-success hover:bg-success/10"
                            : "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10",
                      )}
                    >
                      <span className="font-mono font-bold">{cls.time_slot}</span>
                      <span>·</span>
                      <span>{cls.cohort}</span>
                      <span>·</span>
                      <span className="truncate max-w-[140px]">{cls.subject}</span>
                      <span>·</span>
                      <span className="text-muted-foreground">{cls.room}</span>
                      {isCovered ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success ml-1" />
                      ) : (
                        <UserX className="h-3.5 w-3.5 text-destructive ml-1" />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Mini Daily Timeline Strip */}
      {!scheduleLoading && scheduleData && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              Daily Schedule Strip — {facultyDisplayName} ({scheduleData.day_name})
            </h3>
            <span className="text-[11px] text-muted-foreground">Click a period to resolve coverage</span>
          </div>

          <div className="grid grid-cols-5 gap-2 pt-1">
            {timelinePeriods.map((tp) => {
              const matchedClass = scheduleData.affected_classes.find((c) => c.time_slot === tp.code)
              const isSelected = selectedSlot === tp.code
              const isCovered = !!matchedClass?.assigned_substitute_id

              return (
                <div
                  key={tp.code}
                  onClick={() => {
                    if (matchedClass) {
                      setSelectedSlot(tp.code)
                    }
                  }}
                  className={cn(
                    "flex flex-col justify-between rounded-xl border p-2.5 text-xs transition-all min-h-[90px]",
                    matchedClass ? "cursor-pointer" : "opacity-60 bg-muted/10 border-dashed border-border/60",
                    isSelected && matchedClass && "ring-2 ring-primary border-primary bg-primary/10 shadow-sm",
                    !isSelected && matchedClass && isCovered && "border-success/30 bg-success/[0.04] hover:border-success/60",
                    !isSelected && matchedClass && !isCovered && "border-destructive/40 bg-destructive/[0.04] hover:border-destructive/70",
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono font-bold text-foreground">{tp.code}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{tp.time}</span>
                  </div>

                  {matchedClass ? (
                    <div className="space-y-1 my-1">
                      <p className="font-semibold text-foreground text-[11px] truncate leading-tight" title={matchedClass.subject}>
                        {matchedClass.subject}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {matchedClass.cohort} · {matchedClass.room}
                      </p>
                    </div>
                  ) : (
                    <div className="my-auto text-center text-[11px] text-muted-foreground/60 italic select-none">
                      Free Period
                    </div>
                  )}

                  {matchedClass ? (
                    isCovered ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Covered</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-destructive">
                        <UserX className="h-3 w-3" />
                        <span>Coverage Required</span>
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] text-muted-foreground/40 font-mono">—</span>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Faculty Picker & Date Selection */}
      <Card className="p-5">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Select Absent Faculty
            </Label>
            {facultyLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Loading faculty directory…</span>
              </div>
            ) : facultyList.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {facultyList.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setAbsentTeacherId(f.id)}
                    className={
                      "flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium transition-all " +
                      (absentTeacherId === f.id
                        ? "border-primary bg-primary/10 text-primary shadow-glow-primary font-semibold"
                        : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:text-foreground")
                    }
                  >
                    <UserX className="h-3.5 w-3.5" />
                    <span>{f.id} — {f.name}</span>
                    <span className="text-[10px] opacity-70">({f.subject})</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground bg-muted/20 flex items-center justify-between">
                <span>No faculty added to your university yet.</span>
                <Link href="/admin/users?tab=teachers" className="text-primary hover:underline font-medium">
                  Add Faculty
                </Link>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="custom-faculty">Or Enter Faculty ID</Label>
              <div className="relative">
                <UserX className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="custom-faculty"
                  value={absentTeacherId}
                  onChange={(e) => setAbsentTeacherId(e.target.value)}
                  placeholder="e.g. F01"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <div className="relative">
                <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Workflow: Today's Affected Classes + Substitute Recommendations */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Affected Classes from Timetable (7 cols) */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Affected Classes for {facultyDisplayName} ({scheduleData?.day_name ?? "Today"})
            </h3>
            {scheduleLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          </div>

          <div className="space-y-3">
            {scheduleData?.affected_classes.map((cls) => {
              const isSelected = selectedSlot === cls.time_slot
              const isAssigned = !!cls.assigned_substitute_id
              const timetableDeepLink = `/timetable?faculty=${encodeURIComponent(absentTeacherId)}&date=${encodeURIComponent(date)}&period=${encodeURIComponent(cls.time_slot)}&cohort=${encodeURIComponent(cls.cohort)}`

              return (
                <Card
                  key={cls.time_slot}
                  onClick={() => setSelectedSlot(cls.time_slot)}
                  className={cn(
                    "cursor-pointer p-4 transition-all space-y-3",
                    isSelected
                      ? "border-primary bg-primary/[0.04] shadow-md ring-1 ring-primary/40"
                      : "hover:border-primary/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs font-bold">
                        {cls.time_slot} · {cls.period_label}
                      </Badge>
                      <Badge variant="neutral" className="gap-1 text-xs">
                        <Users className="h-3 w-3" />
                        {cls.cohort}
                      </Badge>
                      {cls.student_count && (
                        <span className="text-[11px] text-muted-foreground">
                          {cls.student_count} students
                        </span>
                      )}
                    </div>

                    {isAssigned ? (
                      <Badge variant="success" className="gap-1 text-xs shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Covered by {cls.assigned_substitute_name || cls.assigned_substitute_id}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1 text-xs shrink-0">
                        <UserX className="h-3.5 w-3.5" />
                        ⚠ Coverage Required
                      </Badge>
                    )}
                  </div>

                  <div>
                    <div className="text-sm font-bold text-foreground flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <span>{cls.subject}</span>
                      {cls.subject_code && (
                        <span className="text-xs font-mono font-normal text-muted-foreground">
                          ({cls.subject_code})
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 opacity-70" />
                        Room: <strong className="text-foreground">{cls.room}</strong>
                        {cls.room_capacity && <span>(Cap: {cls.room_capacity})</span>}
                      </span>
                      <span>·</span>
                      <span>
                        Original Faculty: <strong className="text-foreground">{facultyDisplayName} ({absentTeacherId})</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <Link
                      href={timetableDeepLink}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>View in Timetable</span>
                    </Link>

                    <Button
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedSlot(cls.time_slot)
                      }}
                    >
                      {isSelected ? "Selected Slot" : "Select Slot"}
                    </Button>
                  </div>
                </Card>
              )
            })}

            {!scheduleLoading && (!scheduleData || scheduleData.affected_classes.length === 0) && (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                No scheduled classes found for this faculty member on {date}.
              </Card>
            )}
          </div>
        </div>

        {/* Right Column: PredictiveAllocator Recommendations & Action (5 cols) */}
        <div className="space-y-4 lg:col-span-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Recommended Substitutes for {selectedSlot}
            </h3>
            {candidatesLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          </div>

          <Card className="space-y-4 p-5">
            {activeSlotData && (
              <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3 text-xs space-y-1">
                <p className="font-semibold text-foreground">
                  Target Class: {activeSlotData.time_slot} ({activeSlotData.period_label})
                </p>
                <p className="text-muted-foreground">
                  {activeSlotData.cohort} · {activeSlotData.subject} · {activeSlotData.room}
                </p>
                {activeSlotData.assigned_substitute_id && (
                  <p className="font-semibold text-success pt-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Covered by: {activeSlotData.assigned_substitute_name || activeSlotData.assigned_substitute_id}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                ML Ranked Candidates (PredictiveAllocator)
              </Label>

              {displayedCandidates && displayedCandidates.length > 0 ? (
                <div className="space-y-2">
                  {displayedCandidates.map((cand, idx) => {
                    const isCandidateAssigned = cand.teacher_id === activeSlotData?.assigned_substitute_id
                    return (
                      <div
                        key={cand.teacher_id}
                        className={cn(
                          "flex flex-col gap-2 rounded-xl border p-3 text-xs transition-all",
                          isCandidateAssigned
                            ? "border-success/50 bg-success/[0.06]"
                            : "border-border bg-card hover:border-primary/30",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 font-bold text-foreground">
                              <span>{cand.full_name}</span>
                              <span className="text-[11px] font-mono text-muted-foreground">({cand.teacher_id})</span>
                              {idx === 0 && (
                                <Badge variant="live" className="text-[10px] py-0 px-1.5">Top Match</Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{cand.subject}</p>
                          </div>

                          <div className="text-right">
                            <Badge variant="outline" className="border-primary/40 text-primary font-bold text-[10px]">
                              {Math.round(cand.suitability_score * 100)}% Suitability
                            </Badge>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <span className="text-success font-medium">Available</span>
                            <span>·</span>
                            <span>
                              Subject Match: {Math.round(cand.subject_compatibility_score * 100)}%
                            </span>
                            {cand.total_historical_substitutions !== undefined && (
                              <>
                                <span>·</span>
                                <span>Load: {cand.total_historical_substitutions}</span>
                              </>
                            )}
                          </div>

                          <Button
                            size="sm"
                            variant={isCandidateAssigned ? "secondary" : "default"}
                            className="h-7 text-xs font-semibold px-3"
                            disabled={resolving || isCandidateAssigned}
                            onClick={() => handleAssignSubstitute(cand.teacher_id)}
                          >
                            {isCandidateAssigned ? "✓ Assigned" : "Assign Substitute"}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Click below to trigger the ML ranking engine across all available faculty for slot {selectedSlot}.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full gap-2 text-xs"
                    disabled={resolving || !selectedSlot}
                    onClick={() => handleAssignSubstitute()}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    Auto-Allocate Top ML Candidate
                  </Button>
                </div>
              )}
            </div>

            {Boolean(resolveResult) && resolveResult && (
              <div className="rounded-xl border border-success/30 bg-success/[0.05] p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="success" className="gap-1 text-xs">
                    <UserCheck className="h-3.5 w-3.5" />
                    Assigned
                  </Badge>
                  <Badge variant="live" className="gap-1 text-xs">
                    <Radio className="h-3.5 w-3.5 animate-pulse text-destructive" />
                    Broadcasted Live
                  </Badge>
                </div>
                <p className="text-sm font-semibold text-foreground">
                  Substitute: {resolveResult.substitute_teacher_id}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {resolveResult.message}
                </p>
              </div>
            )}

            {Boolean(error) && (
              <ErrorState error={error} onRetry={() => handleAssignSubstitute()} />
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function SubstitutePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading substitute resolution…</div>}>
      <SubstituteContent />
    </Suspense>
  )
}
