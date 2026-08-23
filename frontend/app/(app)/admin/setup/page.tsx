"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  Building2,
  Users,
  School,
  BookOpen,
  DoorOpen,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  Sparkles,
  Layers,
  Check,
  Calendar,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/lib/auth"
import { api, ApiError } from "@/lib/api"
import { spring, staggerContainer, riseItem } from "@/lib/motion"

const STEPS = [
  { id: 1, label: "Institution", icon: Building2 },
  { id: 2, label: "Faculty", icon: Users },
  { id: 3, label: "Cohorts", icon: School },
  { id: 4, label: "Students", icon: GraduationCap },
  { id: 5, label: "Courses", icon: BookOpen },
  { id: 6, label: "Rooms", icon: DoorOpen },
  { id: 7, label: "Finish", icon: CheckCircle2 },
]

export default function UniversitySetupWizard() {
  const router = useRouter()
  const { user, refresh } = useAuth()
  const [currentStep, setCurrentStep] = useState(1)

  // Step 1 State
  const [universityName, setUniversityName] = useState("")
  const [shortName, setShortName] = useState("")
  const [academicYear, setAcademicYear] = useState("2026-2027")
  const [workingDays, setWorkingDays] = useState(5)
  const [periodsPerDay, setPeriodsPerDay] = useState(6)
  const [startTime, setStartTime] = useState("09:00")

  // Entity Lists
  const [teachers, setTeachers] = useState<any[]>([])
  const [cohorts, setCohorts] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])

  // Temporary Form Inputs
  const [newTeacher, setNewTeacher] = useState({ id: "", name: "", email: "", dept: "Computer Science", subjects: "", maxHours: 18 })
  const [newCohort, setNewCohort] = useState({ id: "", name: "", dept: "Computer Science", grade: "1st Year", section: "A", capacity: 40 })
  const [newStudent, setNewStudent] = useState({ id: "", name: "", email: "", cohort: "", grade: "1st Year", section: "A" })
  const [newSubject, setNewSubject] = useState({ id: "", name: "", code: "", dept: "Computer Science", credits: 3, hours: 3, roomType: "lecture" })
  const [newRoom, setNewRoom] = useState({ id: "", name: "", type: "lecture", capacity: 40 })

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [quickStarting, setQuickStarting] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvStatus, setCsvStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const inst = await api.getUniversity()
        if (inst.university_name) setUniversityName(inst.university_name)
        if (inst.short_name) setShortName(inst.short_name)
        if (inst.academic_year) setAcademicYear(inst.academic_year)
        if (inst.working_days_per_week) setWorkingDays(inst.working_days_per_week)
        if (inst.periods_per_day) setPeriodsPerDay(inst.periods_per_day)

        // Load existing entities
        const [tList, cList, sList, subList, rList] = await Promise.all([
          api.listTeachers(0, 200).catch(() => []),
          api.listClasses(0, 200).catch(() => []),
          api.listStudents(0, 200).catch(() => []),
          api.listSubjects(0, 200).catch(() => []),
          api.listRooms(0, 200).catch(() => []),
        ])
        setTeachers(tList)
        setCohorts(cList)
        setStudents(sList)
        setSubjects(subList)
        setRooms(rList)
      } catch (err) {
        console.error("Failed to load setup data", err)
      } finally {
        setLoading(false)
      }
    }
    void loadData()
  }, [])

  async function handleSaveSettings() {
    if (!universityName.trim()) {
      setError("Please enter your university name.")
      return false
    }
    setError(null)
    setSaving(true)
    try {
      await api.updateUniversity({
        university_name: universityName.trim(),
        short_name: shortName.trim() || undefined,
        academic_year: academicYear.trim(),
        working_days_per_week: workingDays,
        periods_per_day: periodsPerDay,
        start_time: startTime,
        is_setup_complete: true,
      })
      await refresh()
      return true
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail)
      else setError("Failed to save university settings.")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleQuickStart() {
    setError(null)
    setQuickStarting(true)
    try {
      if (universityName.trim()) {
        await api.patch("/admin/university", { university_name: universityName.trim() })
      }
      const res = await api.quickStartUniversity()
      await refresh()
      setSuccess(res.message || "Starter template provisioned!")
      
      // Reload entities
      const [tList, cList, sList, subList, rList] = await Promise.all([
        api.listTeachers(0, 200),
        api.listClasses(0, 200),
        api.listStudents(0, 200),
        api.listSubjects(0, 200),
        api.listRooms(0, 200),
      ])
      setTeachers(tList)
      setCohorts(cList)
      setStudents(sList)
      setSubjects(subList)
      setRooms(rList)
      setCurrentStep(7)
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail)
      else setError("Failed to provision starter dataset.")
    } finally {
      setQuickStarting(false)
    }
  }

  async function handleAddTeacher(e: React.FormEvent) {
    e.preventDefault()
    if (!newTeacher.id.trim() || !newTeacher.name.trim()) return
    try {
      const subs = newTeacher.subjects.split(",").map((s) => s.trim()).filter(Boolean)
      const res = await api.createTeacher({
        teacher_id: newTeacher.id.trim(),
        full_name: newTeacher.name.trim(),
        email: newTeacher.email.trim() || `${newTeacher.id.toLowerCase()}@campusnova.edu`,
        department: newTeacher.dept,
        subjects: subs.length > 0 ? subs : ["General"],
        max_hours: newTeacher.maxHours,
      })
      setTeachers((prev) => [...prev, res])
      setNewTeacher({ id: "", name: "", email: "", dept: "Computer Science", subjects: "", maxHours: 18 })
    } catch (err: any) {
      setError(err?.detail || "Failed to create faculty member.")
    }
  }

  async function handleDeleteTeacher(id: string) {
    try {
      await api.deleteTeacher(id, true)
      setTeachers((prev) => prev.filter((t) => (t.teacher_id || t.id) !== id))
    } catch (err: any) {
      setError(err?.detail || "Failed to delete teacher.")
    }
  }

  async function handleAddCohort(e: React.FormEvent) {
    e.preventDefault()
    if (!newCohort.id.trim()) return
    try {
      const res = await api.createClass({
        class_id: newCohort.id.trim(),
        name: newCohort.name.trim() || newCohort.id.trim(),
        department: newCohort.dept,
        grade: newCohort.grade,
        section: newCohort.section,
        capacity: newCohort.capacity,
      })
      setCohorts((prev) => [...prev, res])
      setNewCohort({ id: "", name: "", dept: "Computer Science", grade: "1st Year", section: "A", capacity: 40 })
    } catch (err: any) {
      setError(err?.detail || "Failed to create cohort.")
    }
  }

  async function handleDeleteCohort(id: string) {
    try {
      await api.deleteClass(id)
      setCohorts((prev) => prev.filter((c) => (c.class_id || c.cohort_id) !== id))
    } catch (err: any) {
      setError(err?.detail || "Failed to delete cohort.")
    }
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!newStudent.id.trim() || !newStudent.name.trim()) return
    try {
      const res = await api.createStudent({
        student_id: newStudent.id.trim(),
        full_name: newStudent.name.trim(),
        email: newStudent.email.trim() || `${newStudent.id.toLowerCase()}@campusnova.edu`,
        cohort_id: newStudent.cohort || (cohorts[0]?.class_id ?? "CS-YEAR-1"),
        grade: newStudent.grade,
        section: newStudent.section,
      })
      setStudents((prev) => [...prev, res])
      setNewStudent({ id: "", name: "", email: "", cohort: "", grade: "1st Year", section: "A" })
    } catch (err: any) {
      setError(err?.detail || "Failed to create student.")
    }
  }

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvStatus("Importing CSV records...")
    try {
      const res = await api.bulkImportStudents(file)
      setCsvStatus(`Imported ${res.imported_count} students successfully! (${res.duplicate_count} duplicates skipped)`)
      const updated = await api.listStudents(0, 200)
      setStudents(updated)
    } catch (err: any) {
      setCsvStatus(`Import error: ${err?.detail || "Failed to parse CSV file."}`)
    }
  }

  async function handleDeleteStudent(id: string) {
    try {
      await api.deleteStudent(id)
      setStudents((prev) => prev.filter((s) => (s.student_id || s.id) !== id))
    } catch (err: any) {
      setError(err?.detail || "Failed to delete student.")
    }
  }

  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault()
    if (!newSubject.id.trim() || !newSubject.name.trim()) return
    try {
      const res = await api.createSubject({
        subject_id: newSubject.id.trim(),
        name: newSubject.name.trim(),
        code: newSubject.code.trim() || newSubject.id.trim(),
        department: newSubject.dept,
        credits: newSubject.credits,
        required_weekly_hours: newSubject.hours,
        room_type: newSubject.roomType,
      })
      setSubjects((prev) => [...prev, res])
      setNewSubject({ id: "", name: "", code: "", dept: "Computer Science", credits: 3, hours: 3, roomType: "lecture" })
    } catch (err: any) {
      setError(err?.detail || "Failed to create course.")
    }
  }

  async function handleDeleteSubject(id: string) {
    try {
      await api.deleteSubject(id)
      setSubjects((prev) => prev.filter((s) => (s.subject_id || s.id) !== id))
    } catch (err: any) {
      setError(err?.detail || "Failed to delete subject.")
    }
  }

  async function handleAddRoom(e: React.FormEvent) {
    e.preventDefault()
    if (!newRoom.id.trim()) return
    try {
      const res = await api.createRoom({
        room_id: newRoom.id.trim(),
        name: newRoom.name.trim() || newRoom.id.trim(),
        room_type: newRoom.type,
        capacity: newRoom.capacity,
      })
      setRooms((prev) => [...prev, res])
      setNewRoom({ id: "", name: "", type: "lecture", capacity: 40 })
    } catch (err: any) {
      setError(err?.detail || "Failed to create room.")
    }
  }

  async function handleDeleteRoom(id: string) {
    try {
      await api.deleteRoom(id)
      setRooms((prev) => prev.filter((r) => (r.room_id || r.id) !== id))
    } catch (err: any) {
      setError(err?.detail || "Failed to delete room.")
    }
  }

  async function handleNext() {
    if (currentStep === 1) {
      const ok = await handleSaveSettings()
      if (!ok) return
    }
    if (currentStep < 7) {
      setCurrentStep(currentStep + 1)
    } else {
      router.push("/")
    }
  }

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      {/* Top Header */}
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-2">
              <Building2 className="h-3.5 w-3.5" />
              <span>University Setup Wizard</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {universityName ? `${universityName} Setup` : "Configure Your University Workspace"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Build your isolated institution directory: faculty, cohorts, students, courses, and rooms.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={handleQuickStart}
            disabled={quickStarting}
            className="self-start sm:self-auto gap-2 border-primary/30 text-primary hover:bg-primary/5"
          >
            <Sparkles className="h-4 w-4" />
            <span>{quickStarting ? "Provisioning..." : "Quick-Start Template"}</span>
          </Button>
        </div>

        {/* Step Progress Bar */}
        <div className="grid grid-cols-7 gap-2 pt-4">
          {STEPS.map((s) => {
            const Icon = s.icon
            const isDone = s.id < currentStep
            const isCurrent = s.id === currentStep
            return (
              <button
                key={s.id}
                onClick={() => setCurrentStep(s.id)}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border text-center transition-all ${
                  isCurrent
                    ? "border-primary bg-primary/10 text-primary font-semibold shadow-sm"
                    : isDone
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                    : "border-slate-200 text-muted-foreground opacity-60 hover:opacity-100"
                }`}
              >
                <div className={`p-1.5 rounded-lg ${isCurrent ? "bg-primary text-primary-foreground" : isDone ? "bg-emerald-600 text-white" : "bg-slate-100 dark:bg-slate-800"}`}>
                  {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </div>
                <span className="text-xs truncate w-full">{s.label}</span>
              </button>
            )
          })}
        </div>
      </motion.div>

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* STEP 1: Institution Info */}
      {currentStep === 1 && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <span>Step 1: University Information & Academic Structure</span>
            </CardTitle>
            <CardDescription>
              Define your university's name, academic calendar, working days, and timetable period slots.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="univName">Institution Name *</Label>
                <Input
                  id="univName"
                  placeholder="e.g. Stanford University or MIT"
                  value={universityName}
                  onChange={(e) => setUniversityName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shortName">Short Name / Code</Label>
                <Input
                  id="shortName"
                  placeholder="e.g. STAN or MIT"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="academicYear">Academic Year</Label>
                <Input
                  id="academicYear"
                  placeholder="2026-2027"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startTime">Campus Day Start Time</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workingDays">Working Days per Week ({workingDays} days)</Label>
                <Input
                  id="workingDays"
                  type="number"
                  min={1}
                  max={7}
                  value={workingDays}
                  onChange={(e) => setWorkingDays(parseInt(e.target.value) || 5)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodsPerDay">Periods / Class Slots per Day ({periodsPerDay} slots)</Label>
                <Input
                  id="periodsPerDay"
                  type="number"
                  min={1}
                  max={12}
                  value={periodsPerDay}
                  onChange={(e) => setPeriodsPerDay(parseInt(e.target.value) || 6)}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-4">
            <span className="text-xs text-muted-foreground">All data is scoped strictly to your university ID.</span>
            <Button onClick={handleNext} disabled={saving} className="gap-2">
              <span>Next: Add Faculty</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STEP 2: Faculty */}
      {currentStep === 2 && (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1 border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Add Faculty Member</CardTitle>
              <CardDescription>Add professors and instructors to your directory.</CardDescription>
            </CardHeader>
            <form onSubmit={handleAddTeacher}>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Teacher ID *</Label>
                  <Input placeholder="e.g. T01 or FAC-101" value={newTeacher.id} onChange={(e) => setNewTeacher({ ...newTeacher, id: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Full Name *</Label>
                  <Input placeholder="Prof. Alan Turing" value={newTeacher.name} onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Department</Label>
                  <Input placeholder="Computer Science" value={newTeacher.dept} onChange={(e) => setNewTeacher({ ...newTeacher, dept: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Subjects / Expertise (comma-separated)</Label>
                  <Input placeholder="Algorithms, AI, Systems" value={newTeacher.subjects} onChange={(e) => setNewTeacher({ ...newTeacher, subjects: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max Weekly Load (Hours)</Label>
                  <Input type="number" min={1} max={40} value={newTeacher.maxHours} onChange={(e) => setNewTeacher({ ...newTeacher, maxHours: parseInt(e.target.value) || 18 })} />
                </div>
                <Button type="submit" size="sm" className="w-full gap-2 mt-2">
                  <Plus className="h-4 w-4" />
                  <span>Add Teacher</span>
                </Button>
              </CardContent>
            </form>
          </Card>

          <Card className="md:col-span-2 border-slate-200/80 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Faculty Directory ({teachers.length})</CardTitle>
                  <CardDescription>Instructors available for timetable generation and substitutions.</CardDescription>
                </div>
                <Badge variant={teachers.length > 0 ? "default" : "secondary"}>{teachers.length} Added</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {teachers.length === 0 ? (
                <div className="p-8 text-center border rounded-xl border-dashed bg-slate-50 dark:bg-slate-900/40 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="font-medium text-sm">No faculty members added yet.</p>
                  <p className="text-xs mt-1">Use the form on the left or click Quick-Start Template to populate sample faculty.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {teachers.map((t) => (
                    <div key={t.teacher_id || t.id} className="flex items-center justify-between p-3 rounded-lg border bg-card text-sm">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          <span>{t.full_name || t.name}</span>
                          <Badge variant="outline" className="text-xs font-mono">{t.teacher_id || t.id}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {t.department || "General"} • {Array.isArray(t.subjects) ? t.subjects.join(", ") : t.subject || "All subjects"}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteTeacher(t.teacher_id || t.id)} className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between border-t pt-4">
              <Button variant="outline" onClick={() => setCurrentStep(1)} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>
              <Button onClick={handleNext} className="gap-2">
                <span>Next: Add Cohorts</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* STEP 3: Cohorts & Classes */}
      {currentStep === 3 && (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1 border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Add Cohort / Class</CardTitle>
              <CardDescription>Create student cohorts for scheduling.</CardDescription>
            </CardHeader>
            <form onSubmit={handleAddCohort}>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Cohort ID *</Label>
                  <Input placeholder="e.g. CS-YEAR-1 or CSE-A" value={newCohort.id} onChange={(e) => setNewCohort({ ...newCohort, id: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cohort Name</Label>
                  <Input placeholder="e.g. CS Year 1 - Section A" value={newCohort.name} onChange={(e) => setNewCohort({ ...newCohort, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Department</Label>
                  <Input placeholder="Computer Science" value={newCohort.dept} onChange={(e) => setNewCohort({ ...newCohort, dept: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Year / Grade</Label>
                    <Input placeholder="1st Year" value={newCohort.grade} onChange={(e) => setNewCohort({ ...newCohort, grade: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Section</Label>
                    <Input placeholder="A" value={newCohort.section} onChange={(e) => setNewCohort({ ...newCohort, section: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max Capacity</Label>
                  <Input type="number" min={1} max={200} value={newCohort.capacity} onChange={(e) => setNewCohort({ ...newCohort, capacity: parseInt(e.target.value) || 40 })} />
                </div>
                <Button type="submit" size="sm" className="w-full gap-2 mt-2">
                  <Plus className="h-4 w-4" />
                  <span>Add Cohort</span>
                </Button>
              </CardContent>
            </form>
          </Card>

          <Card className="md:col-span-2 border-slate-200/80 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Cohorts Directory ({cohorts.length})</CardTitle>
                  <CardDescription>Academic classes that attend scheduled course offerings.</CardDescription>
                </div>
                <Badge variant={cohorts.length > 0 ? "default" : "secondary"}>{cohorts.length} Added</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {cohorts.length === 0 ? (
                <div className="p-8 text-center border rounded-xl border-dashed bg-slate-50 dark:bg-slate-900/40 text-muted-foreground">
                  <School className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="font-medium text-sm">No cohorts created yet.</p>
                  <p className="text-xs mt-1">Create your first class cohort on the left.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {cohorts.map((c) => (
                    <div key={c.class_id || c.cohort_id} className="flex items-center justify-between p-3 rounded-lg border bg-card text-sm">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          <span>{c.name || c.class_id || c.cohort_id}</span>
                          <Badge variant="outline" className="text-xs font-mono">{c.class_id || c.cohort_id}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {c.department || "General"} • {c.grade || "Year 1"} Sec {c.section || "A"} • Capacity: {c.capacity || 40} students
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteCohort(c.class_id || c.cohort_id)} className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between border-t pt-4">
              <Button variant="outline" onClick={() => setCurrentStep(2)} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>
              <Button onClick={handleNext} className="gap-2">
                <span>Next: Add Students</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* STEP 4: Students */}
      {currentStep === 4 && (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1 border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Add Student / Bulk CSV</CardTitle>
              <CardDescription>Enroll students into cohorts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* CSV Upload */}
              <div className="p-3 rounded-lg border border-dashed bg-slate-50 dark:bg-slate-900/50 space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5 text-primary" />
                  <span>Bulk CSV Import</span>
                </Label>
                <Input type="file" accept=".csv" onChange={handleCsvImport} className="text-xs" />
                {csvStatus && <p className="text-xs text-primary font-medium">{csvStatus}</p>}
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-2 text-xs text-muted-foreground uppercase">Or Add Single</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <form onSubmit={handleAddStudent} className="space-y-2.5">
                <div className="space-y-1">
                  <Label className="text-xs">Student ID *</Label>
                  <Input placeholder="e.g. STU-101" value={newStudent.id} onChange={(e) => setNewStudent({ ...newStudent, id: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Full Name *</Label>
                  <Input placeholder="Alice Morgan" value={newStudent.name} onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cohort Assignment</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
                    value={newStudent.cohort}
                    onChange={(e) => setNewStudent({ ...newStudent, cohort: e.target.value })}
                  >
                    <option value="">Select Cohort</option>
                    {cohorts.map((c) => (
                      <option key={c.class_id || c.cohort_id} value={c.class_id || c.cohort_id}>
                        {c.name || c.class_id || c.cohort_id}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" size="sm" className="w-full gap-2 mt-2">
                  <Plus className="h-4 w-4" />
                  <span>Add Student</span>
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 border-slate-200/80 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Student Roster ({students.length})</CardTitle>
                  <CardDescription>Enrolled students tracked for attendance, leaves, and OCR.</CardDescription>
                </div>
                <Badge variant={students.length > 0 ? "default" : "secondary"}>{students.length} Enrolled</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {students.length === 0 ? (
                <div className="p-8 text-center border rounded-xl border-dashed bg-slate-50 dark:bg-slate-900/40 text-muted-foreground">
                  <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="font-medium text-sm">No students enrolled yet.</p>
                  <p className="text-xs mt-1">Upload a CSV or add students individually.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {students.map((s) => (
                    <div key={s.student_id || s.id} className="flex items-center justify-between p-3 rounded-lg border bg-card text-sm">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          <span>{s.full_name || s.name}</span>
                          <Badge variant="outline" className="text-xs font-mono">{s.student_id || s.id}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Cohort: <span className="font-medium text-foreground">{s.cohort_id || s.class_id || "Unassigned"}</span> • {s.email || "No email"}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteStudent(s.student_id || s.id)} className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between border-t pt-4">
              <Button variant="outline" onClick={() => setCurrentStep(3)} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>
              <Button onClick={handleNext} className="gap-2">
                <span>Next: Add Courses</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* STEP 5: Courses */}
      {currentStep === 5 && (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1 border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Add Course / Subject</CardTitle>
              <CardDescription>Define curriculum requirements.</CardDescription>
            </CardHeader>
            <form onSubmit={handleAddSubject}>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Subject ID *</Label>
                  <Input placeholder="e.g. CS101" value={newSubject.id} onChange={(e) => setNewSubject({ ...newSubject, id: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Course Name *</Label>
                  <Input placeholder="e.g. Data Structures" value={newSubject.name} onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Course Code</Label>
                  <Input placeholder="CS-101" value={newSubject.code} onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Credits</Label>
                    <Input type="number" min={1} max={10} value={newSubject.credits} onChange={(e) => setNewSubject({ ...newSubject, credits: parseInt(e.target.value) || 3 })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Weekly Sessions</Label>
                    <Input type="number" min={1} max={10} value={newSubject.hours} onChange={(e) => setNewSubject({ ...newSubject, hours: parseInt(e.target.value) || 3 })} />
                  </div>
                </div>
                <Button type="submit" size="sm" className="w-full gap-2 mt-2">
                  <Plus className="h-4 w-4" />
                  <span>Add Course</span>
                </Button>
              </CardContent>
            </form>
          </Card>

          <Card className="md:col-span-2 border-slate-200/80 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Courses Directory ({subjects.length})</CardTitle>
                  <CardDescription>Academic offerings scheduled by the CP-SAT timetable solver.</CardDescription>
                </div>
                <Badge variant={subjects.length > 0 ? "default" : "secondary"}>{subjects.length} Added</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {subjects.length === 0 ? (
                <div className="p-8 text-center border rounded-xl border-dashed bg-slate-50 dark:bg-slate-900/40 text-muted-foreground">
                  <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="font-medium text-sm">No courses added yet.</p>
                  <p className="text-xs mt-1">Create courses to solve schedules for your cohorts.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {subjects.map((sub) => (
                    <div key={sub.subject_id || sub.id} className="flex items-center justify-between p-3 rounded-lg border bg-card text-sm">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          <span>{sub.name}</span>
                          <Badge variant="outline" className="text-xs font-mono">{sub.subject_id || sub.id}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {sub.department || "General"} • {sub.credits || 3} Credits • {sub.required_weekly_hours || 3} sessions/week
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteSubject(sub.subject_id || sub.id)} className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between border-t pt-4">
              <Button variant="outline" onClick={() => setCurrentStep(4)} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>
              <Button onClick={handleNext} className="gap-2">
                <span>Next: Add Rooms</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* STEP 6: Rooms */}
      {currentStep === 6 && (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1 border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Add Room / Facility</CardTitle>
              <CardDescription>Classrooms and laboratories.</CardDescription>
            </CardHeader>
            <form onSubmit={handleAddRoom}>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Room ID / Number *</Label>
                  <Input placeholder="e.g. ROOM-101" value={newRoom.id} onChange={(e) => setNewRoom({ ...newRoom, id: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Room Name</Label>
                  <Input placeholder="e.g. Lecture Hall 101" value={newRoom.name} onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Room Type</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
                    value={newRoom.type}
                    onChange={(e) => setNewRoom({ ...newRoom, type: e.target.value })}
                  >
                    <option value="lecture">Lecture Hall</option>
                    <option value="lab">Computing / Hardware Lab</option>
                    <option value="seminar">Seminar Room</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Capacity (Seats)</Label>
                  <Input type="number" min={1} max={500} value={newRoom.capacity} onChange={(e) => setNewRoom({ ...newRoom, capacity: parseInt(e.target.value) || 40 })} />
                </div>
                <Button type="submit" size="sm" className="w-full gap-2 mt-2">
                  <Plus className="h-4 w-4" />
                  <span>Add Room</span>
                </Button>
              </CardContent>
            </form>
          </Card>

          <Card className="md:col-span-2 border-slate-200/80 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Facilities Directory ({rooms.length})</CardTitle>
                  <CardDescription>Available spaces for scheduling classes without room collisions.</CardDescription>
                </div>
                <Badge variant={rooms.length > 0 ? "default" : "secondary"}>{rooms.length} Added</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {rooms.length === 0 ? (
                <div className="p-8 text-center border rounded-xl border-dashed bg-slate-50 dark:bg-slate-900/40 text-muted-foreground">
                  <DoorOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="font-medium text-sm">No rooms added yet.</p>
                  <p className="text-xs mt-1">Add lecture halls and laboratories on the left.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {rooms.map((r) => (
                    <div key={r.room_id || r.id} className="flex items-center justify-between p-3 rounded-lg border bg-card text-sm">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          <span>{r.name || r.room_id || r.id}</span>
                          <Badge variant="outline" className="text-xs font-mono">{r.room_id || r.id}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Type: <span className="capitalize">{r.room_type || "lecture"}</span> • Capacity: {r.capacity || 40} seats
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteRoom(r.room_id || r.id)} className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between border-t pt-4">
              <Button variant="outline" onClick={() => setCurrentStep(5)} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>
              <Button onClick={handleNext} className="gap-2">
                <span>Next: Review & Finish</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* STEP 7: Finish & Summary */}
      {currentStep === 7 && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-2">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-bold">University Workspace Ready!</CardTitle>
            <CardDescription>
              {universityName || "Your institution"} has been configured with complete directory isolation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-4 rounded-xl border bg-slate-50/50 dark:bg-slate-900/50 text-center">
                <div className="text-2xl font-bold text-primary">{teachers.length}</div>
                <div className="text-xs text-muted-foreground mt-1">Faculty Members</div>
              </div>
              <div className="p-4 rounded-xl border bg-slate-50/50 dark:bg-slate-900/50 text-center">
                <div className="text-2xl font-bold text-primary">{cohorts.length}</div>
                <div className="text-xs text-muted-foreground mt-1">Cohorts / Classes</div>
              </div>
              <div className="p-4 rounded-xl border bg-slate-50/50 dark:bg-slate-900/50 text-center">
                <div className="text-2xl font-bold text-primary">{students.length}</div>
                <div className="text-xs text-muted-foreground mt-1">Enrolled Students</div>
              </div>
              <div className="p-4 rounded-xl border bg-slate-50/50 dark:bg-slate-900/50 text-center">
                <div className="text-2xl font-bold text-primary">{subjects.length}</div>
                <div className="text-xs text-muted-foreground mt-1">Courses / Subjects</div>
              </div>
              <div className="p-4 rounded-xl border bg-slate-50/50 dark:bg-slate-900/50 text-center col-span-2 sm:col-span-1">
                <div className="text-2xl font-bold text-primary">{rooms.length}</div>
                <div className="text-xs text-muted-foreground mt-1">Rooms & Labs</div>
              </div>
            </div>

            <div className="rounded-xl border p-4 bg-primary/5 border-primary/15 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-primary">
                <Layers className="h-4 w-4" />
                <span>Next Recommended Actions</span>
              </h4>
              <p className="text-xs text-muted-foreground">
                Your directory entities are fully connected to every module: CP-SAT Timetable Solver, Geofenced Attendance, ML Substitute Resolution, OCR Ingestion, and AI Command Center.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-3 justify-between border-t pt-4">
            <Button variant="outline" onClick={() => setCurrentStep(1)}>Edit Information</Button>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={() => router.push("/timetable")} className="flex-1 sm:flex-none">
                Build Timetable
              </Button>
              <Button onClick={() => router.push("/")} className="flex-1 sm:flex-none gap-2 bg-primary">
                <span>Go to Dashboard</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
