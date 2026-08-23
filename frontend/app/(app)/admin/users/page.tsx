"use client"

import { useState } from "react"
import useSWR from "swr"
import { motion } from "framer-motion"
import {
  Users,
  GraduationCap,
  School,
  BookOpen,
  DoorOpen,
  Plus,
  Trash2,
  Edit2,
  Search,
  Loader2,
  AlertTriangle,
  Upload,
} from "lucide-react"

import { api, ApiError } from "@/lib/api"
import { PageHeading, ErrorState } from "@/components/states"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

type Tab = "faculty" | "students" | "cohorts" | "courses" | "rooms"

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "faculty", label: "Faculty", icon: <Users className="h-4 w-4" /> },
  { id: "students", label: "Students", icon: <GraduationCap className="h-4 w-4" /> },
  { id: "cohorts", label: "Cohorts", icon: <School className="h-4 w-4" /> },
  { id: "courses", label: "Courses", icon: <BookOpen className="h-4 w-4" /> },
  { id: "rooms", label: "Rooms & Labs", icon: <DoorOpen className="h-4 w-4" /> },
]

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/* ──────────────────────────── Modals ──────────────────────────── */

function CreateTeacherModal({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [id, setId] = useState("")
  const [name, setName] = useState("")
  const [dept, setDept] = useState("Computer Science")
  const [subjectsRaw, setSubjectsRaw] = useState("")
  const [maxHours, setMaxHours] = useState(18)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const subs = subjectsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      await api.createTeacher({
        teacher_id: id.trim(),
        full_name: name.trim(),
        email: `${id.toLowerCase()}@campusnova.edu`,
        department: dept,
        subjects: subs.length > 0 ? subs : ["General"],
        max_hours: maxHours,
      })
      onSuccess()
    } catch (err: any) {
      setError(err?.detail || "Failed to create teacher.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h3 className="mb-4 text-base font-semibold">Add Faculty Member</h3>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Teacher ID *</Label>
          <Input placeholder="e.g. T01 or FAC-101" value={id} onChange={(e) => setId(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Full Name *</Label>
          <Input placeholder="Prof. Alan Turing" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Department</Label>
          <Input placeholder="Computer Science" value={dept} onChange={(e) => setDept(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Subjects / Expertise (comma-separated)</Label>
          <Input placeholder="Algorithms, AI, Systems" value={subjectsRaw} onChange={(e) => setSubjectsRaw(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Max Weekly Load (Hours)</Label>
          <Input type="number" min={1} max={40} value={maxHours} onChange={(e) => setMaxHours(parseInt(e.target.value) || 18)} />
        </div>
        {error && <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={loading}>
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </form>
    </ModalOverlay>
  )
}

function CreateStudentModal({ cohorts, onSuccess, onClose }: { cohorts: any[]; onSuccess: () => void; onClose: () => void }) {
  const [id, setId] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [cohort, setCohort] = useState("")
  const [grade, setGrade] = useState("1st Year")
  const [section, setSection] = useState("A")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.createStudent({
        student_id: id.trim(),
        full_name: name.trim(),
        email: email.trim() || `${id.toLowerCase()}@campusnova.edu`,
        cohort_id: cohort || (cohorts[0]?.class_id ?? null),
        grade,
        section,
      })
      onSuccess()
    } catch (err: any) {
      setError(err?.detail || "Failed to create student.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h3 className="mb-4 text-base font-semibold">Add Student</h3>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Student ID *</Label>
          <Input placeholder="e.g. STU-101" value={id} onChange={(e) => setId(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Full Name *</Label>
          <Input placeholder="Alice Morgan" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Email</Label>
          <Input type="email" placeholder="alice@campusnova.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cohort Assignment</Label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
          >
            <option value="">Select Cohort</option>
            {cohorts.map((c) => (
              <option key={c.class_id || c.cohort_id} value={c.class_id || c.cohort_id}>
                {c.name || c.class_id || c.cohort_id}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={loading}>
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </form>
    </ModalOverlay>
  )
}

function CreateCohortModal({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [id, setId] = useState("")
  const [name, setName] = useState("")
  const [dept, setDept] = useState("Computer Science")
  const [grade, setGrade] = useState("1st Year")
  const [section, setSection] = useState("A")
  const [capacity, setCapacity] = useState(40)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.createClass({
        class_id: id.trim(),
        name: name.trim() || id.trim(),
        department: dept,
        grade,
        section,
        capacity,
      })
      onSuccess()
    } catch (err: any) {
      setError(err?.detail || "Failed to create cohort.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h3 className="mb-4 text-base font-semibold">Add Cohort / Class</h3>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Cohort ID *</Label>
          <Input placeholder="e.g. CS-YEAR-1 or CSE-A" value={id} onChange={(e) => setId(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cohort Display Name</Label>
          <Input placeholder="e.g. CS Year 1 - Section A" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Department</Label>
          <Input placeholder="Computer Science" value={dept} onChange={(e) => setDept(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Grade / Year</Label>
            <Input placeholder="1st Year" value={grade} onChange={(e) => setGrade(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Section</Label>
            <Input placeholder="A" value={section} onChange={(e) => setSection(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Capacity</Label>
          <Input type="number" min={1} max={200} value={capacity} onChange={(e) => setCapacity(parseInt(e.target.value) || 40)} />
        </div>
        {error && <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={loading}>
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </form>
    </ModalOverlay>
  )
}

function CreateCourseModal({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [id, setId] = useState("")
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [dept, setDept] = useState("Computer Science")
  const [credits, setCredits] = useState(3)
  const [hours, setHours] = useState(3)
  const [roomType, setRoomType] = useState("lecture")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.createSubject({
        subject_id: id.trim(),
        name: name.trim(),
        code: code.trim() || id.trim(),
        department: dept,
        credits,
        required_weekly_hours: hours,
        room_type: roomType,
      })
      onSuccess()
    } catch (err: any) {
      setError(err?.detail || "Failed to create course.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h3 className="mb-4 text-base font-semibold">Add Course / Subject</h3>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Subject ID *</Label>
          <Input placeholder="e.g. CS101" value={id} onChange={(e) => setId(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Course Name *</Label>
          <Input placeholder="e.g. Data Structures" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Course Code</Label>
          <Input placeholder="CS-101" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Credits</Label>
            <Input type="number" min={1} max={10} value={credits} onChange={(e) => setCredits(parseInt(e.target.value) || 3)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Weekly Sessions</Label>
            <Input type="number" min={1} max={10} value={hours} onChange={(e) => setHours(parseInt(e.target.value) || 3)} />
          </div>
        </div>
        {error && <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={loading}>
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </form>
    </ModalOverlay>
  )
}

function CreateRoomModal({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [id, setId] = useState("")
  const [name, setName] = useState("")
  const [type, setType] = useState("lecture")
  const [capacity, setCapacity] = useState(40)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.createRoom({
        room_id: id.trim(),
        name: name.trim() || id.trim(),
        room_type: type,
        capacity,
      })
      onSuccess()
    } catch (err: any) {
      setError(err?.detail || "Failed to create room.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h3 className="mb-4 text-base font-semibold">Add Room / Facility</h3>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Room ID / Number *</Label>
          <Input placeholder="e.g. ROOM-101" value={id} onChange={(e) => setId(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Room Name</Label>
          <Input placeholder="e.g. Lecture Hall 101" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Room Type</Label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="lecture">Lecture Hall</option>
            <option value="lab">Computing / Hardware Lab</option>
            <option value="seminar">Seminar Room</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Capacity</Label>
          <Input type="number" min={1} max={500} value={capacity} onChange={(e) => setCapacity(parseInt(e.target.value) || 40)} />
        </div>
        {error && <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={loading}>
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </form>
    </ModalOverlay>
  )
}

/* ──────────────────────────── Main Page ──────────────────────────── */

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState<Tab>("faculty")
  const [search, setSearch] = useState("")
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null)

  // SWR queries for each directory entity
  const { data: teachers = [], error: tErr, mutate: mutateTeachers } = useSWR("/admin/teachers", () => api.listTeachers(0, 200))
  const { data: students = [], error: sErr, mutate: mutateStudents } = useSWR("/admin/students", () => api.listStudents(0, 200))
  const { data: cohorts = [], error: cErr, mutate: mutateCohorts } = useSWR("/admin/classes", () => api.listClasses(0, 200))
  const { data: subjects = [], error: subErr, mutate: mutateSubjects } = useSWR("/admin/subjects", () => api.listSubjects(0, 200))
  const { data: rooms = [], error: rErr, mutate: mutateRooms } = useSWR("/admin/rooms", () => api.listRooms(0, 200))

  async function handleDelete(type: Tab, id: string) {
    try {
      if (type === "faculty") {
        const res = await api.deleteTeacher(id, true)
        if (res?.warning) {
          setDeleteWarning(res.message)
          return
        }
        mutateTeachers()
      } else if (type === "students") {
        await api.deleteStudent(id)
        mutateStudents()
      } else if (type === "cohorts") {
        await api.deleteClass(id)
        mutateCohorts()
      } else if (type === "courses") {
        await api.deleteSubject(id)
        mutateSubjects()
      } else if (type === "rooms") {
        await api.deleteRoom(id)
        mutateRooms()
      }
    } catch (err: any) {
      console.error("Delete failed", err)
    }
  }

  // Filter lists based on search
  const filteredTeachers = teachers.filter((t: any) =>
    (t.full_name || t.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (t.teacher_id || t.id || "").toLowerCase().includes(search.toLowerCase())
  )
  const filteredStudents = students.filter((s: any) =>
    (s.full_name || s.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.student_id || s.id || "").toLowerCase().includes(search.toLowerCase())
  )
  const filteredCohorts = cohorts.filter((c: any) =>
    (c.name || c.class_id || c.cohort_id || "").toLowerCase().includes(search.toLowerCase())
  )
  const filteredSubjects = subjects.filter((s: any) =>
    (s.name || s.subject_id || s.id || "").toLowerCase().includes(search.toLowerCase())
  )
  const filteredRooms = rooms.filter((r: any) =>
    (r.name || r.room_id || r.id || "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeading
          title="University Academic Directory"
          description="Manage institutional rosters, faculty assignments, cohorts, curriculum offerings, and campus rooms."
        />
        <Button onClick={() => setModalOpen(true)} className="gap-2 self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          <span>Add {activeTab.slice(0, -1)}</span>
        </Button>
      </div>

      {deleteWarning && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{deleteWarning}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setDeleteWarning(null)}>Dismiss</Button>
        </div>
      )}

      {/* Tabs & Search Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              className="gap-2"
            >
              {tab.icon}
              <span>{tab.label}</span>
              <Badge variant={activeTab === tab.id ? "secondary" : "outline"} className="ml-1 text-xs">
                {tab.id === "faculty" ? teachers.length :
                 tab.id === "students" ? students.length :
                 tab.id === "cohorts" ? cohorts.length :
                 tab.id === "courses" ? subjects.length : rooms.length}
              </Badge>
            </Button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${activeTab}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
      </div>

      {/* TAB CONTENT: Faculty */}
      {activeTab === "faculty" && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="pt-6">
            {filteredTeachers.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-semibold text-base">No faculty members found</p>
                <p className="text-xs mt-1">Add your university professors to start building your academic directory.</p>
                <Button size="sm" onClick={() => setModalOpen(true)} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  <span>Add First Faculty Member</span>
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTeachers.map((t: any) => (
                  <div key={t.teacher_id || t.id} className="p-4 rounded-xl border bg-card flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="font-mono text-xs">{t.teacher_id || t.id}</Badge>
                        <Badge variant="secondary" className="text-xs">{t.department || "General"}</Badge>
                      </div>
                      <h4 className="font-semibold text-base mt-2">{t.full_name || t.name}</h4>
                      <p className="text-xs text-muted-foreground">{t.email || "No email provided"}</p>
                    </div>
                    <div className="border-t pt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Max: {t.max_hours || 18} hrs/wk</span>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete("faculty", t.teacher_id || t.id)} className="text-destructive hover:bg-destructive/10 h-7 w-7 p-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB CONTENT: Students */}
      {activeTab === "students" && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="pt-6">
            {filteredStudents.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-semibold text-base">No students enrolled</p>
                <p className="text-xs mt-1">Enroll students into cohorts to track attendance and admissions.</p>
                <Button size="sm" onClick={() => setModalOpen(true)} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  <span>Add First Student</span>
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredStudents.map((s: any) => (
                  <div key={s.student_id || s.id} className="p-4 rounded-xl border bg-card flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="font-mono text-xs">{s.student_id || s.id}</Badge>
                        <Badge variant="secondary" className="text-xs">{s.cohort_id || s.class_id || "No Cohort"}</Badge>
                      </div>
                      <h4 className="font-semibold text-base mt-2">{s.full_name || s.name}</h4>
                      <p className="text-xs text-muted-foreground">{s.email || "No email"}</p>
                    </div>
                    <div className="border-t pt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{s.grade || "Year 1"} {s.section ? `• Sec ${s.section}` : ""}</span>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete("students", s.student_id || s.id)} className="text-destructive hover:bg-destructive/10 h-7 w-7 p-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB CONTENT: Cohorts */}
      {activeTab === "cohorts" && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="pt-6">
            {filteredCohorts.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <School className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-semibold text-base">No cohorts created</p>
                <p className="text-xs mt-1">Create cohorts to group students and schedule classes.</p>
                <Button size="sm" onClick={() => setModalOpen(true)} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  <span>Add First Cohort</span>
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredCohorts.map((c: any) => (
                  <div key={c.class_id || c.cohort_id} className="p-4 rounded-xl border bg-card flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="font-mono text-xs">{c.class_id || c.cohort_id}</Badge>
                        <Badge variant="secondary" className="text-xs">{c.department || "General"}</Badge>
                      </div>
                      <h4 className="font-semibold text-base mt-2">{c.name || c.class_id || c.cohort_id}</h4>
                      <p className="text-xs text-muted-foreground">Capacity: {c.capacity || 40} seats • Students: {c.student_count || 0}</p>
                    </div>
                    <div className="border-t pt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{c.grade || "Year 1"} Sec {c.section || "A"}</span>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete("cohorts", c.class_id || c.cohort_id)} className="text-destructive hover:bg-destructive/10 h-7 w-7 p-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB CONTENT: Courses */}
      {activeTab === "courses" && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="pt-6">
            {filteredSubjects.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-semibold text-base">No courses defined</p>
                <p className="text-xs mt-1">Define courses and required weekly sessions for the timetable solver.</p>
                <Button size="sm" onClick={() => setModalOpen(true)} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  <span>Add First Course</span>
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredSubjects.map((s: any) => (
                  <div key={s.subject_id || s.id} className="p-4 rounded-xl border bg-card flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="font-mono text-xs">{s.subject_id || s.id}</Badge>
                        <Badge variant="secondary" className="text-xs">{s.department || "General"}</Badge>
                      </div>
                      <h4 className="font-semibold text-base mt-2">{s.name}</h4>
                      <p className="text-xs text-muted-foreground">{s.required_weekly_hours || 3} weekly sessions • {s.credits || 3} credits</p>
                    </div>
                    <div className="border-t pt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="capitalize">{s.room_type || "lecture"} room</span>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete("courses", s.subject_id || s.id)} className="text-destructive hover:bg-destructive/10 h-7 w-7 p-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB CONTENT: Rooms */}
      {activeTab === "rooms" && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="pt-6">
            {filteredRooms.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <DoorOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-semibold text-base">No rooms or laboratories added</p>
                <p className="text-xs mt-1">Add campus facilities to allocate spaces for class sessions.</p>
                <Button size="sm" onClick={() => setModalOpen(true)} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  <span>Add First Room</span>
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredRooms.map((r: any) => (
                  <div key={r.room_id || r.id} className="p-4 rounded-xl border bg-card flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="font-mono text-xs">{r.room_id || r.id}</Badge>
                        <Badge variant="secondary" className="text-xs capitalize">{r.room_type || "lecture"}</Badge>
                      </div>
                      <h4 className="font-semibold text-base mt-2">{r.name || r.room_id || r.id}</h4>
                      <p className="text-xs text-muted-foreground">Capacity: {r.capacity || 40} seats</p>
                    </div>
                    <div className="border-t pt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Status: {r.status || "active"}</span>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete("rooms", r.room_id || r.id)} className="text-destructive hover:bg-destructive/10 h-7 w-7 p-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Modals */}
      {modalOpen && activeTab === "faculty" && (
        <CreateTeacherModal onSuccess={() => { setModalOpen(false); mutateTeachers(); }} onClose={() => setModalOpen(false)} />
      )}
      {modalOpen && activeTab === "students" && (
        <CreateStudentModal cohorts={cohorts} onSuccess={() => { setModalOpen(false); mutateStudents(); }} onClose={() => setModalOpen(false)} />
      )}
      {modalOpen && activeTab === "cohorts" && (
        <CreateCohortModal onSuccess={() => { setModalOpen(false); mutateCohorts(); }} onClose={() => setModalOpen(false)} />
      )}
      {modalOpen && activeTab === "courses" && (
        <CreateCourseModal onSuccess={() => { setModalOpen(false); mutateSubjects(); }} onClose={() => setModalOpen(false)} />
      )}
      {modalOpen && activeTab === "rooms" && (
        <CreateRoomModal onSuccess={() => { setModalOpen(false); mutateRooms(); }} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}
