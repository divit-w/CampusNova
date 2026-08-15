"use client"

import { useState } from "react"
import useSWR from "swr"
import { motion } from "framer-motion"
import {
  BookOpen,
  GraduationCap,
  Loader2,
  Plus,
  Users,
} from "lucide-react"

import {
  api,
  type AdminStudentRecord,
  type AdminTeacherRecord,
  type CreateClassPayload,
  type CreateStudentPayload,
  type CreateTeacherPayload,
} from "@/lib/api"
import { ApiError } from "@/lib/api"
import type { ClassResponse } from "@/lib/types"
import { PageHeading, ErrorState } from "@/components/states"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

type Tab = "students" | "teachers" | "classes"

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "students", label: "Students", icon: <GraduationCap className="h-4 w-4" /> },
  { id: "teachers", label: "Teachers", icon: <Users className="h-4 w-4" /> },
  { id: "classes", label: "Classes", icon: <BookOpen className="h-4 w-4" /> },
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

function CreateStudentModal({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [form, setForm] = useState<CreateStudentPayload>({
    student_id: "", full_name: "", grade: "", section: "", email: "",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const field = (key: keyof CreateStudentPayload) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value })),
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.createStudent(form)
      onSuccess()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(`Student ID "${form.student_id}" already exists.`)
      } else if (err instanceof ApiError) {
        setError(err.detail)
      } else {
        setError("An unexpected error occurred.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h3 className="mb-4 text-base font-semibold">Add Student</h3>
      <form onSubmit={submit} className="space-y-3">
        {(["student_id", "full_name", "grade", "section", "email"] as const).map((key) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={key} className="capitalize">{key.replace("_", " ")}</Label>
            <Input id={key} required type={key === "email" ? "email" : "text"} {...field(key)} />
          </div>
        ))}
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={loading}>
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Create
          </Button>
        </div>
      </form>
    </ModalOverlay>
  )
}

function CreateTeacherModal({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [form, setForm] = useState<CreateTeacherPayload>({
    teacher_id: "", full_name: "", subjects: [], email: "",
  })
  const [subjectsRaw, setSubjectsRaw] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const payload = { ...form, subjects: subjectsRaw.split(",").map((s) => s.trim()).filter(Boolean) }
    setLoading(true)
    setError(null)
    try {
      await api.createTeacher(payload)
      onSuccess()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(`Teacher ID "${form.teacher_id}" already exists.`)
      } else if (err instanceof ApiError) {
        setError(err.detail)
      } else {
        setError("An unexpected error occurred.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h3 className="mb-4 text-base font-semibold">Add Teacher</h3>
      <form onSubmit={submit} className="space-y-3">
        {(["teacher_id", "full_name", "email"] as const).map((key) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={key} className="capitalize">{key.replace("_", " ")}</Label>
            <Input
              id={key} required
              type={key === "email" ? "email" : "text"}
              value={form[key]}
              onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
            />
          </div>
        ))}
        <div className="space-y-1">
          <Label htmlFor="subjects">Subjects (comma-separated)</Label>
          <Input
            id="subjects" required
            placeholder="Math, Physics, Chemistry"
            value={subjectsRaw}
            onChange={(e) => setSubjectsRaw(e.target.value)}
          />
        </div>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={loading}>
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Create
          </Button>
        </div>
      </form>
    </ModalOverlay>
  )
}

function CreateClassModal({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [form, setForm] = useState<CreateClassPayload>({
    class_id: "", teacher_id: "", subject: "", schedule_time: "", grade: "", section: "",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const field = (key: keyof CreateClassPayload) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value })),
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.createClass(form)
      onSuccess()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(`Class ID "${form.class_id}" already exists.`)
      } else if (err instanceof ApiError) {
        setError(err.detail)
      } else {
        setError("An unexpected error occurred.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h3 className="mb-4 text-base font-semibold">Add Class</h3>
      <form onSubmit={submit} className="space-y-3">
        {(["class_id", "teacher_id", "subject", "schedule_time", "grade", "section"] as const).map((key) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={key} className="capitalize">{key.replace("_", " ")}</Label>
            <Input id={key} required {...field(key)} />
          </div>
        ))}
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={loading}>
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Create
          </Button>
        </div>
      </form>
    </ModalOverlay>
  )
}

function StudentTable({ data }: { data: AdminStudentRecord[] }) {
  if (!data.length) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">No students found.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted-foreground">
            <th className="px-4 py-3">Student ID</th>
            <th className="px-4 py-3">Full Name</th>
            <th className="px-4 py-3">Grade</th>
            <th className="px-4 py-3">Section</th>
            <th className="px-4 py-3">Email</th>
          </tr>
        </thead>
        <tbody>
          {data.map((s) => (
            <tr key={s.student_id} className="border-b border-border/50 hover:bg-accent/40 transition-colors">
              <td className="px-4 py-3 font-mono text-xs font-medium">{s.student_id}</td>
              <td className="px-4 py-3">{s.full_name}</td>
              <td className="px-4 py-3"><Badge variant="outline">{s.grade}</Badge></td>
              <td className="px-4 py-3">{s.section}</td>
              <td className="px-4 py-3 text-muted-foreground">{s.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TeacherTable({ data }: { data: AdminTeacherRecord[] }) {
  if (!data.length) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">No teachers found.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted-foreground">
            <th className="px-4 py-3">Teacher ID</th>
            <th className="px-4 py-3">Full Name</th>
            <th className="px-4 py-3">Subjects</th>
            <th className="px-4 py-3">Email</th>
          </tr>
        </thead>
        <tbody>
          {data.map((t) => (
            <tr key={t.teacher_id} className="border-b border-border/50 hover:bg-accent/40 transition-colors">
              <td className="px-4 py-3 font-mono text-xs font-medium">{t.teacher_id}</td>
              <td className="px-4 py-3">{t.full_name}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {t.subjects.map((s) => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{t.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ClassTable({ data }: { data: ClassResponse[] }) {
  if (!data.length) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">No classes found.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted-foreground">
            <th className="px-4 py-3">Class ID</th>
            <th className="px-4 py-3">Subject</th>
            <th className="px-4 py-3">Teacher</th>
            <th className="px-4 py-3">Grade</th>
            <th className="px-4 py-3">Section</th>
            <th className="px-4 py-3">Schedule</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.class_id} className="border-b border-border/50 hover:bg-accent/40 transition-colors">
              <td className="px-4 py-3 font-mono text-xs font-medium">{c.class_id}</td>
              <td className="px-4 py-3 font-medium">{c.subject}</td>
              <td className="px-4 py-3 font-mono text-xs">{c.teacher_id}</td>
              <td className="px-4 py-3"><Badge variant="outline">{c.grade}</Badge></td>
              <td className="px-4 py-3">{c.section}</td>
              <td className="px-4 py-3 text-muted-foreground">{c.schedule_time}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AdminUsersPage() {
  const [activeTab, setActiveTab] = useState<Tab>("students")
  const [showModal, setShowModal] = useState(false)

  const {
    data: students,
    error: studentsError,
    mutate: refreshStudents,
  } = useSWR<AdminStudentRecord[]>(
    activeTab === "students" ? "/admin/students-list" : null,
    () => api.listStudents(0, 100),
    { revalidateOnFocus: false },
  )

  const {
    data: teachers,
    error: teachersError,
    mutate: refreshTeachers,
  } = useSWR<AdminTeacherRecord[]>(
    activeTab === "teachers" ? "/admin/teachers-list" : null,
    () => api.listTeachers(0, 100),
    { revalidateOnFocus: false },
  )

  const {
    data: classes,
    error: classesError,
    mutate: refreshClasses,
  } = useSWR<ClassResponse[]>(
    activeTab === "classes" ? "/admin/classes-list" : null,
    () => api.listClasses(0, 100),
    { revalidateOnFocus: false },
  )

  const isLoading =
    (activeTab === "students" && !students && !studentsError) ||
    (activeTab === "teachers" && !teachers && !teachersError) ||
    (activeTab === "classes" && !classes && !classesError)

  const currentError = activeTab === "students" ? studentsError
    : activeTab === "teachers" ? teachersError
    : classesError

  function handleSuccess() {
    setShowModal(false)
    if (activeTab === "students") refreshStudents()
    else if (activeTab === "teachers") refreshTeachers()
    else refreshClasses()
  }

  return (
    <div className="space-y-6">
      <PageHeading
        icon={<Users className="h-5 w-5" />}
        title={<span className="text-gradient-brand">User Management</span>}
        description="Create and browse students, teachers, and class records. All data is persisted to MongoDB and immediately reflected in the portals."
        actions={
          <Button onClick={() => setShowModal(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add {activeTab.slice(0, -1)}
          </Button>
        }
      />

      <div className="flex gap-1 rounded-xl border border-border bg-secondary/40 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all " +
              (activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : currentError ? (
            <ErrorState error={currentError} />
          ) : activeTab === "students" ? (
            <StudentTable data={students ?? []} />
          ) : activeTab === "teachers" ? (
            <TeacherTable data={teachers ?? []} />
          ) : (
            <ClassTable data={classes ?? []} />
          )}
        </Card>
      </motion.div>

      {showModal && activeTab === "students" && (
        <CreateStudentModal onSuccess={handleSuccess} onClose={() => setShowModal(false)} />
      )}
      {showModal && activeTab === "teachers" && (
        <CreateTeacherModal onSuccess={handleSuccess} onClose={() => setShowModal(false)} />
      )}
      {showModal && activeTab === "classes" && (
        <CreateClassModal onSuccess={handleSuccess} onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}
