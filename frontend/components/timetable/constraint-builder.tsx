"use client"

import { Dispatch, SetStateAction, useState } from "react"
import { Trash2, Plus, Check, CalendarOff } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { TimetablePayload, TimetableTeacher } from "@/lib/types"

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

export function ConstraintBuilder({
  payload,
  onChange,
}: {
  payload: TimetablePayload
  onChange: Dispatch<SetStateAction<TimetablePayload>>
}) {
  const [activeTab, setActiveTab] = useState<"faculty" | "cohorts" | "curriculum">("faculty")

  const updateTeacher = (index: number, field: keyof TimetableTeacher, value: any) => {
    const next = [...payload.teachers]
    next[index] = { ...next[index], [field]: value }
    onChange({ ...payload, teachers: next })
  }

  const removeTeacher = (index: number) => {
    const next = payload.teachers.filter((_, i) => i !== index)
    onChange({ ...payload, teachers: next })
  }

  const addTeacher = () => {
    const id = `T${payload.teachers.length + 1}`
    onChange({
      ...payload,
      teachers: [
        ...payload.teachers,
        {
          id,
          name: "New Teacher",
          max_hours: 20,
          blocked_periods: [],
          morning_bias: false,
          consecutive_free_periods: true,
          avoid_fridays: false,
        },
      ],
    })
  }

  const addBlockedPeriod = (teacherIndex: number) => {
    const t = payload.teachers[teacherIndex]
    const current = t.blocked_slots || t.blocked_periods || []
    const updated = [...current, { day: 0, period: 0 }]
    const next = [...payload.teachers]
    next[teacherIndex] = { ...next[teacherIndex], blocked_slots: updated, blocked_periods: updated }
    onChange({ ...payload, teachers: next })
  }

  const updateBlockedPeriod = (teacherIndex: number, periodIndex: number, field: "day" | "period", value: number) => {
    const t = payload.teachers[teacherIndex]
    const current = [...(t.blocked_slots || t.blocked_periods || [])]
    current[periodIndex] = { ...current[periodIndex], [field]: value }
    const next = [...payload.teachers]
    next[teacherIndex] = { ...next[teacherIndex], blocked_slots: current, blocked_periods: current }
    onChange({ ...payload, teachers: next })
  }

  const removeBlockedPeriod = (teacherIndex: number, periodIndex: number) => {
    const t = payload.teachers[teacherIndex]
    const current = (t.blocked_slots || t.blocked_periods || []).filter((_, i) => i !== periodIndex)
    const next = [...payload.teachers]
    next[teacherIndex] = { ...next[teacherIndex], blocked_slots: current, blocked_periods: current }
    onChange({ ...payload, teachers: next })
  }

  // --- COHORTS ---
  const addCohortBlock = (cohortIndex: number) => {
    const nextCohorts = [...payload.cohorts]
    const cohort = nextCohorts[cohortIndex]
    const current = cohort.blocked_slots || []
    nextCohorts[cohortIndex] = {
      ...cohort,
      blocked_slots: [...current, { day: 0, period: 0 }],
    }
    onChange({ ...payload, cohorts: nextCohorts })
  }

  const updateCohortBlock = (cohortIndex: number, slotIndex: number, field: "day" | "period", value: number) => {
    const nextCohorts = [...payload.cohorts]
    const cohort = nextCohorts[cohortIndex]
    const current = [...(cohort.blocked_slots || [])]
    current[slotIndex] = { ...current[slotIndex], [field]: value }
    nextCohorts[cohortIndex] = { ...cohort, blocked_slots: current }
    onChange({ ...payload, cohorts: nextCohorts })
  }

  const removeCohortBlock = (cohortIndex: number, slotIndex: number) => {
    const nextCohorts = [...payload.cohorts]
    const cohort = nextCohorts[cohortIndex]
    const current = (cohort.blocked_slots || []).filter((_, i) => i !== slotIndex)
    nextCohorts[cohortIndex] = { ...cohort, blocked_slots: current }
    onChange({ ...payload, cohorts: nextCohorts })
  }

  // --- CURRICULUM ---
  const toggleSubjectTeacher = (subjectIndex: number, teacherId: string) => {
    const nextSubjects = [...payload.subjects]
    const subject = nextSubjects[subjectIndex]
    const currentQualified = subject.qualified_teachers || []

    let updatedQualified: string[]
    if (currentQualified.includes(teacherId)) {
      updatedQualified = currentQualified.filter((id) => id !== teacherId)
    } else {
      updatedQualified = [...currentQualified, teacherId]
    }
    subject.qualified_teachers = updatedQualified

    // Also sync with course_offerings if present
    let nextOfferings = payload.course_offerings
    if (nextOfferings && nextOfferings.length > 0) {
      nextOfferings = nextOfferings.map((o) =>
        o.subject_id === subject.id
          ? { ...o, qualified_teacher_ids: updatedQualified }
          : o
      )
    }

    onChange({
      ...payload,
      subjects: nextSubjects,
      course_offerings: nextOfferings,
    })
  }

  const renderFaculty = () => (
    <div className="space-y-4 flex-1 overflow-y-auto pr-2 pb-10">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Faculty Directory</Label>
        <Button variant="outline" size="sm" onClick={addTeacher} className="h-7 text-xs">
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>

      {payload.teachers.map((t, i) => (
        <Card key={i} className="p-2.5 bg-muted/10 border border-border flex flex-col gap-2 shadow-none">
          <div className="flex items-center gap-2">
            <Input
              value={t.name}
              onChange={(e) => updateTeacher(i, "name", e.target.value)}
              placeholder="Name"
              className="h-7 text-xs font-medium"
            />
            <Input
              type="number"
              value={t.max_hours}
              onChange={(e) => updateTeacher(i, "max_hours", parseInt(e.target.value) || 0)}
              title="Max Hours/Wk"
              className="h-7 w-16 text-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
              onClick={() => removeTeacher(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Hard Boundaries */}
          <div className="space-y-1.5 mt-1">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Blocked Periods</Label>
              <Button variant="ghost" size="sm" onClick={() => addBlockedPeriod(i)} className="h-4 px-1 text-[9px]">
                <Plus className="h-3 w-3 mr-0.5" /> Add
              </Button>
            </div>
            
            {(t.blocked_periods || []).map((bp, bpIdx) => (
              <div key={bpIdx} className="flex items-center gap-1.5">
                <CalendarOff className="h-3 w-3 text-muted-foreground shrink-0" />
                <Select
                  value={bp.day.toString()}
                  onValueChange={(val) => updateBlockedPeriod(i, bpIdx, "day", parseInt(val))}
                >
                  <SelectTrigger className="h-6 text-[10px] px-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: payload.days_per_week }).map((_, d) => (
                      <SelectItem key={d} value={d.toString()}>{DAY_NAMES[d]?.slice(0,3) || `D${d+1}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={bp.period.toString()}
                  onValueChange={(val) => updateBlockedPeriod(i, bpIdx, "period", parseInt(val))}
                >
                  <SelectTrigger className="h-6 text-[10px] px-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: payload.periods_per_day }).map((_, p) => (
                      <SelectItem key={p} value={p.toString()}>P{p+1}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => removeBlockedPeriod(i, bpIdx)} className="h-5 w-5 shrink-0">
                  <Trash2 className="h-2.5 w-2.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          {/* Soft Preferences */}
          <div className="space-y-1.5 mt-1 pt-2 border-t border-border/50">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Preferences</Label>
            <div className="flex flex-wrap gap-1.5">
              <label className="flex items-center gap-1 text-[10px] border rounded px-1.5 py-0.5 cursor-pointer hover:bg-muted select-none">
                <input 
                  type="checkbox" 
                  checked={t.morning_bias || false}
                  onChange={(e) => updateTeacher(i, "morning_bias", e.target.checked)} 
                  className="scale-75"
                />
                Morning
              </label>
              <label className="flex items-center gap-1 text-[10px] border rounded px-1.5 py-0.5 cursor-pointer hover:bg-muted select-none">
                <input 
                  type="checkbox" 
                  checked={t.consecutive_free_periods !== false}
                  onChange={(e) => updateTeacher(i, "consecutive_free_periods", e.target.checked)} 
                  className="scale-75"
                />
                Block Frees
              </label>
              <label className="flex items-center gap-1 text-[10px] border rounded px-1.5 py-0.5 cursor-pointer hover:bg-muted select-none">
                <input 
                  type="checkbox" 
                  checked={t.avoid_fridays || false}
                  onChange={(e) => updateTeacher(i, "avoid_fridays", e.target.checked)} 
                  className="scale-75"
                />
                No Friday
              </label>
            </div>
          </div>
        </Card>
      ))}
      {payload.teachers.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">No teachers added.</div>}
    </div>
  )

  const renderCohorts = () => (
    <div className="space-y-4 flex-1 overflow-y-auto pr-2 pb-10">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Cohort Boundaries</Label>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Block out specific periods for an entire cohort (e.g. Assemblies, Sports, Seminars).
      </p>

      {payload.cohorts.map((cohort, cIdx) => (
        <Card key={cohort.id} className="p-3 bg-muted/10 border border-border flex flex-col gap-2 shadow-none">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-xs">{cohort.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">{cohort.student_count} students</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => addCohortBlock(cIdx)}
                className="h-6 text-[10px] px-2"
              >
                <Plus className="h-2.5 w-2.5 mr-1" /> Add Block
              </Button>
            </div>
          </div>

          {(cohort.blocked_slots || []).length > 0 && (
            <div className="space-y-1.5 mt-1">
              {(cohort.blocked_slots || []).map((slot, sIdx) => (
                <div key={sIdx} className="flex items-center gap-1.5">
                  <CalendarOff className="h-3 w-3 text-muted-foreground shrink-0" />
                  <Select
                    value={slot.day.toString()}
                    onValueChange={(val) => updateCohortBlock(cIdx, sIdx, "day", parseInt(val))}
                  >
                    <SelectTrigger className="h-6 text-[10px] px-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: payload.days_per_week }).map((_, d) => (
                        <SelectItem key={d} value={d.toString()}>{DAY_NAMES[d]?.slice(0, 3) || `D${d + 1}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={slot.period.toString()}
                    onValueChange={(val) => updateCohortBlock(cIdx, sIdx, "period", parseInt(val))}
                  >
                    <SelectTrigger className="h-6 text-[10px] px-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: payload.periods_per_day }).map((_, p) => (
                        <SelectItem key={p} value={p.toString()}>P{p + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCohortBlock(cIdx, sIdx)}
                    className="h-5 w-5 shrink-0"
                  >
                    <Trash2 className="h-2.5 w-2.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
      {payload.cohorts.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-4">No cohorts added.</div>
      )}
    </div>
  )

  const renderCurriculum = () => (
    <div className="space-y-4 flex-1 overflow-y-auto pr-2 pb-10">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Curriculum</Label>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Assign teachers to subjects and set weekly required hours.
      </p>

      {payload.subjects.map((s, i) => (
        <Card key={i} className="p-3 bg-muted/20 border border-border flex flex-col gap-3 shadow-none">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">{s.name}</span>
            <span className="text-xs text-muted-foreground">{s.required_weekly_hours} hrs/wk</span>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
              Qualified Teachers
            </p>
            <div className="flex flex-wrap gap-2">
              {payload.teachers.map((t) => {
                const isQualified = (s.qualified_teachers || []).includes(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleSubjectTeacher(i, t.id)}
                    className={`text-[11px] px-2.5 py-1 rounded-md border flex items-center gap-1.5 transition-colors ${
                      isQualified
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {isQualified && <Check className="h-3 w-3" />}
                    {t.name}
                  </button>
                )
              })}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col h-full space-y-4 w-full">
      {/* Global Config */}
      <div className="grid grid-cols-2 gap-4 pb-4 border-b border-border">
        <div className="space-y-1.5">
          <Label className="text-xs">Days per week</Label>
          <Input
            type="number"
            min={1}
            max={7}
            value={payload.days_per_week}
            onChange={(e) => onChange({ ...payload, days_per_week: parseInt(e.target.value) || 1 })}
            className="h-8"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Periods per day</Label>
          <Input
            type="number"
            min={1}
            max={12}
            value={payload.periods_per_day}
            onChange={(e) => onChange({ ...payload, periods_per_day: parseInt(e.target.value) || 1 })}
            className="h-8"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-muted p-1 rounded-lg">
        {[
          { id: "faculty", label: "Faculty" },
          { id: "cohorts", label: "Cohorts" },
          { id: "curriculum", label: "Curriculum" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 text-[11px] font-medium py-1.5 rounded-md transition-all ${
              activeTab === tab.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="flex-1 flex flex-col h-full overflow-hidden"
          >
            {activeTab === "faculty" && renderFaculty()}
            {activeTab === "cohorts" && renderCohorts()}
            {activeTab === "curriculum" && renderCurriculum()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
