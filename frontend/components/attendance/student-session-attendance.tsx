"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Calendar,
  Users,
  GraduationCap,
  BookOpen,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Save,
  CheckCheck,
  Ban,
  Sparkles,
  CalendarCheck,
  CalendarX,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { api } from "@/lib/api"
import type {
  SessionRosterResponse,
  SessionRosterStudent,
  ScheduledSessionInfo,
  DailySessionStatusResponse,
} from "@/lib/types"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/states"
import { cn } from "@/lib/utils"

export function StudentSessionAttendance({
  selectedDate,
  onDateChange,
  onAttendanceSaved,
}: {
  selectedDate: string
  onDateChange?: (date: string) => void
  onAttendanceSaved?: () => void
}) {
  // Directory States
  const [cohorts, setCohorts] = useState<Array<{ id: string; name: string }>>([])
  const [facultyList, setFacultyList] = useState<Array<{ id: string; name: string; subject: string }>>([])
  const [subjectsList, setSubjectsList] = useState<Array<{ id: string; name: string }>>([])
  const [loadingDirectories, setLoadingDirectories] = useState(true)

  // Selection States
  const [selectedCohort, setSelectedCohort] = useState<string>("")
  const [selectedFaculty, setSelectedFaculty] = useState<string>("")
  const [selectedSubject, setSelectedSubject] = useState<string>("")
  const [selectedPeriod, setSelectedPeriod] = useState<string>("P1")
  const [isManualSession, setIsManualSession] = useState(false)

  // Daily Schedule & Timetable Sessions
  const [dailyStatus, setDailyStatus] = useState<DailySessionStatusResponse | null>(null)
  const [loadingSchedule, setLoadingSchedule] = useState(false)

  // Roster & Attendance Marking States
  const [rosterData, setRosterData] = useState<SessionRosterResponse | null>(null)
  const [studentStatuses, setStudentStatuses] = useState<Record<string, "present" | "absent" | "excused" | "unmarked">>({})
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)

  // 1. Load tenant directories (Cohorts, Faculty, Subjects)
  useEffect(() => {
    let active = true
    async function loadDirectories() {
      try {
        setLoadingDirectories(true)
        const [cList, fList, sList] = await Promise.all([
          api.get<any[]>("/admin/classes"),
          api.get<any[]>("/admin/teachers"),
          api.get<any[]>("/admin/subjects"),
        ])

        if (active) {
          const mappedCohorts = (cList || []).map((c) => ({
            id: c.class_id || c.cohort_id || c.id,
            name: c.name || c.class_id || c.cohort_id,
          }))
          const mappedFaculty = (fList || []).map((f) => ({
            id: f.teacher_id || f.id,
            name: f.full_name || f.name || f.teacher_id,
            subject: f.subject || "Faculty",
          }))
          const mappedSubjects = (sList || []).map((s) => ({
            id: s.subject_id || s.id,
            name: s.name || s.subject_id || s.id,
          }))

          setCohorts(mappedCohorts)
          setFacultyList(mappedFaculty)
          setSubjectsList(mappedSubjects)

          if (mappedCohorts.length > 0 && !selectedCohort) {
            setSelectedCohort(mappedCohorts[0].id)
          }
          if (mappedFaculty.length > 0 && !selectedFaculty) {
            setSelectedFaculty(mappedFaculty[0].id)
          }
          if (mappedSubjects.length > 0 && !selectedSubject) {
            setSelectedSubject(mappedSubjects[0].id)
          }
        }
      } catch (err) {
        console.error("Failed to load attendance directories:", err)
      } finally {
        if (active) setLoadingDirectories(false)
      }
    }

    loadDirectories()
    return () => {
      active = false
    }
  }, [])

  // 2. Load daily sessions from timetable for the selected date
  useEffect(() => {
    let active = true
    async function loadDailySessions() {
      if (!selectedDate) return
      setLoadingSchedule(true)
      try {
        const res = await api.getDailySessions(selectedDate)
        if (active) {
          setDailyStatus(res)
          // If we have scheduled sessions for the currently selected cohort, auto-select the first one
          if (res.scheduled_sessions && res.scheduled_sessions.length > 0) {
            const cohortSessions = res.scheduled_sessions.filter((s: ScheduledSessionInfo) => s.cohort_id === selectedCohort)
            if (cohortSessions.length > 0 && !isManualSession) {
              const s = cohortSessions[0]
              setSelectedPeriod(s.period)
              setSelectedSubject(s.subject_id)
              setSelectedFaculty(s.faculty_id)
            }
          }
        }
      } catch (err) {
        console.error("Failed to load daily sessions:", err)
      } finally {
        if (active) setLoadingSchedule(false)
      }
    }

    loadDailySessions()
    return () => {
      active = false
    }
  }, [selectedDate, selectedCohort, isManualSession])

  // 3. Fetch Roster when cohort / date / session parameters change
  useEffect(() => {
    let active = true
    async function fetchRoster() {
      if (!selectedDate || !selectedCohort) return
      setLoadingRoster(true)
      setSaveFeedback(null)
      try {
        const roster = await api.getSessionRoster(
          selectedDate,
          selectedCohort,
          selectedSubject || undefined,
          selectedPeriod || "P1",
          selectedFaculty || undefined
        )
        if (active) {
          setRosterData(roster)
          // Map initial student statuses
          const initialMap: Record<string, "present" | "absent" | "excused" | "unmarked"> = {}
          roster.students.forEach((st: SessionRosterStudent) => {
            initialMap[st.student_id] = st.status
          })
          setStudentStatuses(initialMap)

          // If timetable identified faculty or subject, sync them
          if (roster.faculty_id && roster.faculty_id !== "UNASSIGNED") {
            setSelectedFaculty(roster.faculty_id)
          }
          if (roster.subject_id && roster.subject_id !== "GENERAL") {
            setSelectedSubject(roster.subject_id)
          }
        }
      } catch (err) {
        console.error("Failed to load student session roster:", err)
      } finally {
        if (active) setLoadingRoster(false)
      }
    }

    fetchRoster()
    return () => {
      active = false
    }
  }, [selectedDate, selectedCohort, selectedSubject, selectedPeriod, selectedFaculty])

  // Quick Action Handlers
  function markAll(status: "present" | "absent" | "unmarked") {
    if (!rosterData) return
    const updated = { ...studentStatuses }
    rosterData.students.forEach((st: SessionRosterStudent) => {
      // Don't overwrite officially approved excused students when bulk marking
      if (updated[st.student_id] !== "excused") {
        updated[st.student_id] = status
      }
    })
    setStudentStatuses(updated)
  }

  function setStudentStatus(studentId: string, status: "present" | "absent" | "excused" | "unmarked") {
    setStudentStatuses((prev) => ({
      ...prev,
      [studentId]: status,
    }))
  }

  // Save Session Attendance
  async function handleSaveAttendance() {
    if (!selectedDate || !selectedCohort || !selectedSubject || !selectedFaculty) {
      setSaveFeedback({ type: "error", message: "Date, Cohort, Subject, and Faculty are required." })
      return
    }

    setSaving(true)
    setSaveFeedback(null)

    const records = Object.entries(studentStatuses).map(([student_id, status]) => ({
      student_id,
      status,
    }))

    try {
      const res = await api.recordSessionAttendance({
        date: selectedDate,
        cohort_id: selectedCohort,
        subject_id: selectedSubject,
        faculty_id: selectedFaculty,
        period: selectedPeriod,
        records,
      })

      setSaveFeedback({
        type: "success",
        message: res.message || "Attendance saved successfully.",
      })
      onAttendanceSaved?.()
    } catch (err: any) {
      const msg = err?.detail || err?.message || "Failed to record attendance."
      setSaveFeedback({ type: "error", message: typeof msg === "string" ? msg : JSON.stringify(msg) })
    } finally {
      setSaving(false)
    }
  }

  const scheduledForCohort = (dailyStatus?.scheduled_sessions || []).filter((s: ScheduledSessionInfo) => s.cohort_id === selectedCohort)

  return (
    <Card className="flex flex-col p-5 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold leading-tight">Student Session Attendance</h3>
            <p className="text-xs text-muted-foreground">Record attendance for scheduled classes or manual sessions</p>
          </div>
        </div>

        {/* Timetable Session vs Manual Toggle */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={!isManualSession ? "secondary" : "outline"}
            size="sm"
            className="text-xs h-8"
            onClick={() => setIsManualSession(false)}
          >
            <CalendarCheck className="h-3.5 w-3.5 mr-1 text-primary" />
            Timetable Sessions
          </Button>
          <Button
            type="button"
            variant={isManualSession ? "secondary" : "outline"}
            size="sm"
            className="text-xs h-8"
            onClick={() => setIsManualSession(true)}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
            Manual Session
          </Button>
        </div>
      </div>

      {/* Daily Status Banner */}
      {dailyStatus && (
        <div
          className={cn(
            "my-3 flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-xs font-medium border",
            !dailyStatus.is_working_day
              ? "border-muted bg-muted/40 text-muted-foreground"
              : dailyStatus.recorded_sessions === dailyStatus.total_scheduled_sessions && dailyStatus.total_scheduled_sessions > 0
              ? "border-success/30 bg-success/[0.08] text-success-foreground"
              : "border-warning/30 bg-warning/[0.08] text-warning-foreground"
          )}
        >
          <div className="flex items-center gap-2">
            {!dailyStatus.is_working_day ? (
              <CalendarX className="h-4 w-4 text-muted-foreground" />
            ) : dailyStatus.recorded_sessions > 0 ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <Clock className="h-4 w-4 text-warning" />
            )}
            <span>{dailyStatus.status_message}</span>
          </div>
          {dailyStatus.is_working_day && dailyStatus.total_scheduled_sessions > 0 && (
            <Badge variant="neutral" className="text-[10px] font-mono">
              {dailyStatus.recorded_sessions} / {dailyStatus.total_scheduled_sessions} Recorded
            </Badge>
          )}
        </div>
      )}

      {/* Session Configuration Form */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 my-3">
        {/* 1. Date */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1 block">Date</Label>
          <Input
            type="date"
            className="h-9 text-xs"
            value={selectedDate}
            onChange={(e) => onDateChange?.(e.target.value)}
          />
        </div>

        {/* 2. Cohort / Class */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1 block">Cohort / Class</Label>
          {loadingDirectories ? (
            <Skeleton className="h-9 w-full" />
          ) : cohorts.length === 0 ? (
            <p className="text-xs text-destructive mt-2">No cohorts found in university.</p>
          ) : (
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedCohort}
              onChange={(e) => setSelectedCohort(e.target.value)}
            >
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 3. Timetable Session OR Period */}
        {!isManualSession && scheduledForCohort.length > 0 ? (
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1 block">Scheduled Class Session</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={`${selectedPeriod}__${selectedSubject}`}
              onChange={(e) => {
                const [p, s] = e.target.value.split("__")
                const match = scheduledForCohort.find((sc: ScheduledSessionInfo) => sc.period === p && sc.subject_id === s)
                if (match) {
                  setSelectedPeriod(match.period)
                  setSelectedSubject(match.subject_id)
                  setSelectedFaculty(match.faculty_id)
                }
              }}
            >
              {scheduledForCohort.map((s: ScheduledSessionInfo, idx: number) => (
                <option key={idx} value={`${s.period}__${s.subject_id}`}>
                  {s.period}: {s.subject_name} ({s.faculty_name}) {s.is_recorded ? "✓ Recorded" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1 block">Class Period</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              <option value="P1">Period 1 (09:00 - 10:00)</option>
              <option value="P2">Period 2 (10:00 - 11:00)</option>
              <option value="P3">Period 3 (11:00 - 12:00)</option>
              <option value="P4">Period 4 (12:00 - 13:00)</option>
              <option value="P5">Period 5 (14:00 - 15:00)</option>
              <option value="P6">Period 6 (15:00 - 16:00)</option>
            </select>
          </div>
        )}

        {/* 4. Faculty (Mandatory tenant selector) */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1 block">Taking Faculty</Label>
          {loadingDirectories ? (
            <Skeleton className="h-9 w-full" />
          ) : facultyList.length === 0 ? (
            <p className="text-xs text-destructive mt-2">No faculty directory found.</p>
          ) : (
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedFaculty}
              onChange={(e) => setSelectedFaculty(e.target.value)}
            >
              {facultyList.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.subject})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Manual Subject Selector if in manual mode */}
      {isManualSession && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-3 pt-1 border-t border-dashed border-border">
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1 block">Subject / Course</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
            >
              {subjectsList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Feedback Banner */}
      <AnimatePresence>
        {saveFeedback && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "my-2 flex items-center gap-2 rounded-lg p-3 text-xs",
              saveFeedback.type === "success"
                ? "bg-success/[0.08] text-success-foreground border border-success/20"
                : "bg-destructive/[0.08] text-destructive border border-destructive/20"
            )}
          >
            {saveFeedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            )}
            <span>{saveFeedback.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Student Roster Section */}
      <div className="mt-3 flex flex-col border border-border rounded-xl overflow-hidden bg-background">
        {/* Roster Bar & Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 p-3.5 bg-muted/40 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold">
              Roster Students ({rosterData?.students.length || 0})
            </span>
            {rosterData?.is_already_recorded && (
              <Badge variant="success" className="text-[10px] py-0 px-2 h-4">
                Saved Session
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-[11px] h-7 px-2.5 gap-1 hover:border-success hover:text-success"
              onClick={() => markAll("present")}
            >
              <CheckCheck className="h-3 w-3" /> Mark All Present
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-[11px] h-7 px-2.5 gap-1 hover:border-destructive hover:text-destructive"
              onClick={() => markAll("absent")}
            >
              <Ban className="h-3 w-3" /> Mark All Absent
            </Button>
          </div>
        </div>

        {/* Student Rows */}
        <div className="max-h-[380px] overflow-y-auto divide-y divide-border">
          {loadingRoster ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !rosterData || rosterData.students.length === 0 ? (
            <div className="p-8 text-center">
              <EmptyState
                icon={Users}
                title="No students found in this cohort"
                description="Add students to this cohort in User Management or select another cohort."
              />
            </div>
          ) : (
            rosterData.students.map((student: SessionRosterStudent) => {
              const currentStatus = studentStatuses[student.student_id] || "unmarked"
              const isExcused = currentStatus === "excused"

              return (
                <div
                  key={student.student_id}
                  className="flex items-center justify-between p-3 px-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-muted-foreground text-xs font-semibold">
                      {student.student_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-semibold leading-tight text-foreground">{student.student_name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {student.student_id} {student.roll_number ? `• Roll: ${student.roll_number}` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Status Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setStudentStatus(student.student_id, "present")}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-all flex items-center gap-1",
                        currentStatus === "present"
                          ? "bg-success text-success-foreground shadow-sm"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      )}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Present
                    </button>

                    <button
                      type="button"
                      onClick={() => setStudentStatus(student.student_id, "absent")}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-all flex items-center gap-1",
                        currentStatus === "absent"
                          ? "bg-destructive text-destructive-foreground shadow-sm"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      )}
                    >
                      <XCircle className="h-3 w-3" />
                      Absent
                    </button>

                    <button
                      type="button"
                      onClick={() => setStudentStatus(student.student_id, "excused")}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-medium transition-all",
                        isExcused
                          ? "bg-warning text-warning-foreground shadow-sm"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      )}
                    >
                      Excused
                    </button>

                    <button
                      type="button"
                      onClick={() => setStudentStatus(student.student_id, "unmarked")}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-medium transition-all",
                        currentStatus === "unmarked"
                          ? "bg-muted-foreground/20 text-foreground"
                          : "text-muted-foreground/60 hover:text-foreground"
                      )}
                    >
                      Unmarked
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer & Save Button */}
        {rosterData && rosterData.students.length > 0 && (
          <div className="flex items-center justify-between p-3.5 bg-muted/30 border-t border-border">
            <div className="text-xs text-muted-foreground">
              <span>Marked: </span>
              <span className="font-semibold text-foreground">
                {Object.values(studentStatuses).filter((s) => s !== "unmarked").length} of {rosterData.students.length}
              </span>
            </div>

            <Button
              type="button"
              onClick={handleSaveAttendance}
              disabled={saving}
              className="gap-1.5 h-8 text-xs font-medium"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? "Saving…" : "Save Attendance"}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
