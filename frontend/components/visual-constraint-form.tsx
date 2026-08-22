"use client"

import { Dispatch, SetStateAction } from "react"
import { Trash2, Plus, Check } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { TimetablePayload } from "@/lib/types"

export function VisualConstraintForm({
  payload,
  onChange,
}: {
  payload: TimetablePayload
  onChange: Dispatch<SetStateAction<TimetablePayload>>
}) {
  const updateTeacher = (index: number, field: string, value: string | number) => {
    const next = [...payload.teachers]
    next[index] = { ...next[index], [field]: value as any }
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
      teachers: [...payload.teachers, { id, name: "New Teacher", max_hours: 20 }],
    })
  }

  const toggleSubjectTeacher = (subjectIndex: number, teacherId: string) => {
    const nextSubjects = [...payload.subjects]
    const subject = nextSubjects[subjectIndex]
    const currentQualified = subject.qualified_teachers || []
    
    if (currentQualified.includes(teacherId)) {
      subject.qualified_teachers = currentQualified.filter(id => id !== teacherId)
    } else {
      subject.qualified_teachers = [...currentQualified, teacherId]
    }
    
    onChange({ ...payload, subjects: nextSubjects })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Days per week</Label>
          <Input 
            type="number" 
            min={1} 
            max={7} 
            value={payload.days_per_week} 
            onChange={(e) => onChange({ ...payload, days_per_week: parseInt(e.target.value) || 1 })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Periods per day</Label>
          <Input 
            type="number" 
            min={1} 
            max={12} 
            value={payload.periods_per_day} 
            onChange={(e) => onChange({ ...payload, periods_per_day: parseInt(e.target.value) || 1 })}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Teachers Pool</Label>
          <Button variant="outline" size="sm" onClick={addTeacher} className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        <div className="space-y-2 max-h-[160px] overflow-y-auto pr-2">
          {payload.teachers.map((t, i) => (
            <Card key={i} className="p-2 grid grid-cols-[1fr_80px_32px] gap-2 items-center bg-muted/40 border-none shadow-none">
              <Input 
                value={t.name} 
                onChange={(e) => updateTeacher(i, "name", e.target.value)} 
                placeholder="Name" 
                className="h-7 text-xs"
              />
              <Input 
                type="number" 
                value={t.max_hours} 
                onChange={(e) => updateTeacher(i, "max_hours", parseInt(e.target.value) || 0)} 
                title="Max Hours"
                className="h-7 text-xs"
              />
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => removeTeacher(i)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </Card>
          ))}
          {payload.teachers.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">No teachers added.</div>
          )}
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Subject Qualifications</Label>
        </div>
        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
          {payload.subjects.map((s, i) => (
            <Card key={i} className="p-3 bg-muted/20 border border-border flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.required_weekly_hours} hrs/wk</span>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Qualified Teachers</p>
                <div className="flex flex-wrap gap-2">
                  {payload.teachers.map(t => {
                    const isQualified = (s.qualified_teachers || []).includes(t.id)
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleSubjectTeacher(i, t.id)}
                        className={`text-xs px-2.5 py-1 rounded-md border flex items-center gap-1.5 transition-colors ${
                          isQualified 
                            ? 'bg-primary/10 border-primary/30 text-primary' 
                            : 'bg-background border-border text-muted-foreground hover:bg-muted'
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
      </div>
    </div>
  )
}
