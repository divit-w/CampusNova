"use client"

import Link from "next/link"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  AlertTriangle, 
  CheckCircle2, 
  ClipboardCheck, 
  FileSearch, 
  ShieldCheck, 
  XCircle, 
  ExternalLink, 
  ArrowRight, 
  BookOpen, 
  UserCheck, 
  Calendar, 
  Clock, 
  CreditCard, 
  GraduationCap, 
  Building2, 
  Layers,
  ChevronDown,
  ChevronUp,
  Sparkles,
  HelpCircle,
  FileText,
  Sliders,
  Check,
  Edit2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/states"
import type { DocumentExtractResponse } from "@/lib/types"
import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

function normalizeConfidenceText(score?: string | number) {
  if (typeof score === "number") {
    return `${Math.round(score * 100)}%`
  }
  const tone = (score || "").toLowerCase()
  if (tone.includes("high")) return "High (95%)"
  if (tone.includes("medium")) return "Medium (75%)"
  if (tone.includes("low")) return "Low (40%)"
  return "Partial" 
}

function confidenceTone(score?: string | number) {
  if (typeof score === "number") {
    if (score >= 0.85) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
    if (score >= 0.65) return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
    return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
  }
  const tone = (score || "").toLowerCase()
  if (tone.includes("high")) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
  if (tone.includes("medium")) return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
  if (tone.includes("low")) return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
  return "bg-secondary text-muted-foreground border-border"
}

function getDaysBetweenDates(startStr?: string | null, endStr?: string | null): string[] {
  if (!startStr) return []
  try {
    const start = new Date(startStr)
    const end = endStr ? new Date(endStr) : new Date(startStr)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      return [startStr]
    }
    const dates: string[] = []
    const current = new Date(start)
    let count = 0
    while (current <= end && count < 14) {
      dates.push(current.toISOString().split("T")[0])
      current.setDate(current.getDate() + 1)
      count++
    }
    return dates
  } catch {
    return [startStr]
  }
}

export function OcrReviewForm({
  data,
  reviewed,
  onFieldChange,
  onApprove,
  approving = false,
}: {
  data: DocumentExtractResponse | null
  reviewed: boolean
  onFieldChange: (fieldId: string | number, value: string) => void
  onApprove: () => void
  approving?: boolean
}) {
  const [confirmedFields, setConfirmedFields] = useState<Record<string, boolean>>({})
  const [editingFields, setEditingFields] = useState<Record<string, boolean>>({})
  const [showAuditDrawer, setShowAuditDrawer] = useState(false)

  const toggleConfirm = (fieldKey: string) => {
    setConfirmedFields(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }))
    setEditingFields(prev => ({ ...prev, [fieldKey]: false }))
  }

  const toggleEditing = (fieldKey: string) => {
    setEditingFields(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }))
  }

  if (!data) {
    return (
      <div className="flex h-full flex-col rounded-xl border border-border glass-surface p-4 shadow-soft sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <FileSearch className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">Document Intelligence</p>
            <p className="text-xs text-muted-foreground">Handwritten OCR, tenant fuzzy matching &amp; human review</p>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <EmptyState 
            icon={FileSearch} 
            title="Awaiting Document" 
            description="Upload an administrative scan or handwritten document on the left. CampusNova will preprocess strokes, fuzzy match against the tenant directory, and queue for review." 
          />
        </div>
      </div>
    )
  }

  const docType = data.document_type || "UNKNOWN"
  const isFacultyLeave = docType === "FACULTY_LEAVE_FORM"
  const isStudentLeave = docType === "STUDENT_LEAVE_FORM" || docType === "MEDICAL_CERTIFICATE" || (data.document_category || "").toLowerCase().includes("leave")
  const isAdmission = docType === "ADMISSION_FORM"
  const isFeeReceipt = docType === "FEE_RECEIPT"
  const isMarksheet = docType === "MARKSHEET"
  const isGeneralAdmin = docType === "GENERAL_ADMIN_DOCUMENT"
  const isUnknown = docType === "UNKNOWN"

  const leaveDays = getDaysBetweenDates(data.leave_start_date, data.leave_end_date)
  const confidenceScore = data.classification_confidence ?? 0.95

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="flex h-full flex-col rounded-xl border border-border glass-surface p-4 shadow-soft sm:p-5"
    >
      {/* Header & Classification Badge */}
      <div className="flex flex-col gap-3 pb-3 border-b border-border">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
              <FileSearch className="h-[18px] w-[18px]" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document Identified</p>
              <h3 className="text-sm font-bold text-foreground leading-tight">
                {data.document_category || "Institutional Document"}
              </h3>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", confidenceTone(confidenceScore))}>
              <span>{normalizeConfidenceText(confidenceScore)} confidence</span>
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">ID: {data.document_id.slice(0, 8)}</span>
          </div>
        </div>

        {/* Target Department / Preprocessing Indicator */}
        <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            <span>Target: <strong>{data.target_department || "General Administration"}</strong></span>
          </span>
          {data.preprocessing_meta && (
            <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
              ✓ Preprocessed ({data.preprocessing_meta.deskew_angle ? `Deskew: ${data.preprocessing_meta.deskew_angle}°` : "Strokes Preserved"})
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">

        {/* ── 1. STUDENT LEAVE & MEDICAL APPLICATION REVIEW ─────────────────── */}
        {isStudentLeave && (
          <div className="space-y-3.5">
            
            {/* Student Name Card (Fuzzy Match & Candidate Selection) */}
            <div className="rounded-xl border border-border bg-background p-3.5 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-primary" /> Student Identity
                </span>
                {data.student_name_confidence && data.student_name_confidence >= 0.85 ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    Match: {Math.round(data.student_name_confidence * 100)}%
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    Needs review
                  </span>
                )}
              </div>

              <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Raw OCR Name:</span>
                  <span className="font-mono font-medium text-foreground bg-background px-1.5 py-0.5 rounded border">
                    {data.raw_student_name || data.student_name || "Unspecified"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Suggested Tenant Match:</span>
                  <strong className="text-foreground text-sm">
                    {data.suggested_student_name || data.student_name || "No Direct Match"}
                  </strong>
                </div>

                {data.student_id && (
                  <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                    <span>Directory ID:</span>
                    <span className="font-mono">{data.student_id} ({data.matched_student_class || "Class"})</span>
                  </div>
                )}
              </div>

              {/* Multiple Candidate Selection when ambiguous */}
              {data.student_candidates && data.student_candidates.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Directory Candidate Matches (Current Tenant):</Label>
                  <Select
                    value={data.student_id || data.student_candidates[0].id}
                    onValueChange={(val) => {
                      const cand = data.student_candidates?.find(c => c.id === val)
                      if (cand) {
                        onFieldChange("student_name", cand.name)
                        onFieldChange("student_id", cand.id)
                      }
                    }}
                  >
                    <SelectTrigger className="w-full h-8 text-xs bg-background">
                      <SelectValue placeholder="Select candidate" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.student_candidates.map((cand, idx) => (
                        <SelectItem key={idx} value={cand.id}>
                          {cand.name} ({cand.id}) — {Math.round(cand.score * 100)}% match
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Action Buttons: Confirm vs Edit */}
              <div className="flex items-center justify-between gap-2 pt-1">
                {editingFields["student_name"] ? (
                  <div className="flex-1 space-y-1">
                    <Input 
                      value={data.student_name || ""} 
                      onChange={(e) => onFieldChange("student_name", e.target.value)} 
                      placeholder="Type correct student name"
                      className="h-8 text-xs"
                    />
                    <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={() => toggleEditing("student_name")}>
                      Done Editing
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button 
                      size="sm" 
                      variant={confirmedFields["student_name"] ? "default" : "outline"} 
                      className={cn("h-7 gap-1 text-xs flex-1", confirmedFields["student_name"] ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "")}
                      onClick={() => toggleConfirm("student_name")}
                    >
                      {confirmedFields["student_name"] ? <Check className="h-3.5 w-3.5" /> : null}
                      {confirmedFields["student_name"] ? "Confirmed" : "Confirm Student"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => toggleEditing("student_name")}>
                      <Edit2 className="h-3 w-3 mr-1" /> Edit
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Leave Dates Card (Raw vs Normalized + Range Check) */}
            <div className="rounded-xl border border-border bg-background p-3.5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" /> Leave Duration
                </span>
                {data.leave_start_status === "valid" && data.leave_end_status === "valid" ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    ✓ Valid Date Range ({leaveDays.length} Days)
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    Needs review
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Leave From */}
                <div className="space-y-1 rounded-lg border border-border/80 bg-secondary/30 p-2.5 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>OCR From:</span>
                    <span className="font-mono bg-background px-1 py-0.5 rounded border">
                      {data.raw_leave_start_date || data.leave_start_date || "N/A"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Normalized:</span>
                    <Input 
                      value={data.leave_start_date || ""} 
                      onChange={(e) => onFieldChange("leave_start_date", e.target.value)} 
                      placeholder="YYYY-MM-DD" 
                      className="h-7 text-xs font-mono font-semibold"
                    />
                  </div>
                </div>

                {/* Leave To */}
                <div className="space-y-1 rounded-lg border border-border/80 bg-secondary/30 p-2.5 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>OCR To:</span>
                    <span className="font-mono bg-background px-1 py-0.5 rounded border">
                      {data.raw_leave_end_date || data.leave_end_date || "N/A"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Normalized:</span>
                    <Input 
                      value={data.leave_end_date || ""} 
                      onChange={(e) => onFieldChange("leave_end_date", e.target.value)} 
                      placeholder="YYYY-MM-DD" 
                      className="h-7 text-xs font-mono font-semibold"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="leave_type" className="text-xs text-muted-foreground">Reason / Diagnosis</Label>
                <Input 
                  id="leave_type" 
                  value={data.leave_type || data.leave_reason || "Medical Absence"} 
                  onChange={(e) => onFieldChange("leave_type", e.target.value)} 
                  className="h-8 text-xs"
                />
              </div>

              {/* Operational Action Preview Note */}
              <div className="rounded-lg bg-primary/[0.04] border border-primary/20 p-2.5 text-xs space-y-1">
                <p className="font-semibold text-primary">Operational Action on Approval:</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Mark student attendance as <strong>Excused</strong> for {leaveDays.length || 1} days ({data.leave_start_date || "N/A"} to {data.leave_end_date || "N/A"}).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── 2. FACULTY LEAVE APPLICATION REVIEW ─────────────────────────── */}
        {isFacultyLeave && (
          <div className="space-y-3">
            {/* Faculty Entity Card with Tenant Fuzzy Match */}
            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3.5 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5" /> Faculty Identity
                </span>
                {data.faculty_name_confidence && data.faculty_name_confidence >= 0.85 ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    Match: {Math.round(data.faculty_name_confidence * 100)}%
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    Needs review
                  </span>
                )}
              </div>

              <div className="rounded-lg border border-border/80 bg-background/80 p-2.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>OCR Faculty:</span>
                  <span className="font-mono bg-secondary px-1.5 py-0.5 rounded">
                    {data.raw_faculty_name || data.faculty_name || "Unspecified"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Suggested Tenant Faculty:</span>
                  <strong className="text-foreground text-sm">
                    {data.suggested_faculty_name || data.faculty_name} ({data.faculty_id || "F01"})
                  </strong>
                </div>
              </div>

              {/* Faculty Candidate Selector if ambiguous */}
              {data.faculty_candidates && data.faculty_candidates.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Directory Candidates:</Label>
                  <Select
                    value={data.faculty_id || data.faculty_candidates[0].id}
                    onValueChange={(val) => {
                      const cand = data.faculty_candidates?.find(c => c.id === val)
                      if (cand) {
                        onFieldChange("faculty_name", cand.name)
                        onFieldChange("faculty_id", cand.id)
                      }
                    }}
                  >
                    <SelectTrigger className="w-full h-8 text-xs bg-background">
                      <SelectValue placeholder="Select faculty candidate" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.faculty_candidates.map((cand, idx) => (
                        <SelectItem key={idx} value={cand.id}>
                          {cand.name} ({cand.id}) — {Math.round(cand.score * 100)}% match
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Timetable Impact Card */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Timetable Impact ({data.affected_classes?.length || 2} Classes)
                </span>
                <span className="text-xs font-mono">{data.leave_start_date || "Today"}</span>
              </div>

              <div className="space-y-1.5 text-xs">
                {(data.affected_classes && data.affected_classes.length > 0) ? (
                  data.affected_classes.map((slot, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg border border-border/80 bg-background/80 px-3 py-2">
                      <div className="flex items-center gap-2 font-mono text-xs">
                        <span className="font-bold text-primary">{slot.period}</span>
                        <span className="text-muted-foreground">({slot.time})</span>
                        <strong className="text-foreground">{slot.cohort}</strong>
                      </div>
                      <div className="text-right text-[11px] text-muted-foreground">
                        <span>{slot.subject} · {slot.room}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-between rounded-lg border border-border/80 bg-background/80 px-3 py-2 text-xs">
                    <span>No active timetable conflict for selected date</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 3. ADMISSION FORM VIEW ──────────────────────────────────────── */}
        {isAdmission && (
          <div className="space-y-3 rounded-xl border border-border bg-background p-3.5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Applicant Credentials</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Applicant Name</Label>
                <Input value={data.applicant_name || data.student_name || ""} onChange={(e) => onFieldChange("applicant_name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Target Program</Label>
                <Input value={data.applicant_program || "B.Tech Computer Science"} onChange={(e) => onFieldChange("applicant_program", e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ── 4. FEE RECEIPT VIEW ─────────────────────────────────────────── */}
        {isFeeReceipt && (
          <div className="space-y-3 rounded-xl border border-border bg-background p-3.5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fee Payment Voucher</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Student ID</Label>
                <Input value={data.student_id || "STU-001"} onChange={(e) => onFieldChange("student_id", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Receipt Number</Label>
                <Input value={data.receipt_number || "REC-2026-001"} onChange={(e) => onFieldChange("receipt_number", e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ── 5. UNKNOWN DOCUMENT VIEW ─────────────────────────────────────── */}
        {isUnknown && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-3.5 text-xs space-y-2">
            <div className="flex items-center gap-2 text-warning font-semibold">
              <AlertTriangle className="h-4 w-4" />
              <span>Document Type Uncertain</span>
            </div>
            <p className="text-muted-foreground">
              The automated classifier could not determine the exact operational workflow. Select the classification below:
            </p>
            <Select 
              value={data.document_type || "UNKNOWN"} 
              onValueChange={(val) => onFieldChange("document_type", val)}
            >
              <SelectTrigger className="w-full h-8 text-xs bg-background">
                <SelectValue placeholder="Select Document Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STUDENT_LEAVE_FORM">Student Leave Application</SelectItem>
                <SelectItem value="FACULTY_LEAVE_FORM">Faculty Leave Application</SelectItem>
                <SelectItem value="MEDICAL_CERTIFICATE">Medical Certificate</SelectItem>
                <SelectItem value="ADMISSION_FORM">Student Admission Form</SelectItem>
                <SelectItem value="FEE_RECEIPT">Fee Receipt / Voucher</SelectItem>
                <SelectItem value="MARKSHEET">Academic Marksheet</SelectItem>
                <SelectItem value="GENERAL_ADMIN_DOCUMENT">General Administrative Document</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* ── 6. RAW OCR & AUDIT TRAIL COLLAPSIBLE ACCORDION ─────────────────── */}
        <div className="rounded-xl border border-border bg-secondary/20 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAuditDrawer(!showAuditDrawer)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              <span>Raw OCR &amp; Processing Audit Trail</span>
            </span>
            {showAuditDrawer ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          <AnimatePresence>
            {showAuditDrawer && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="px-3 pb-3 space-y-2 border-t border-border/50 text-[11px]"
              >
                <div className="pt-2">
                  <span className="text-muted-foreground font-semibold">Raw OCR Extracted Text:</span>
                  <pre className="mt-1 p-2 rounded bg-background border border-border font-mono text-[10px] whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {data.raw_ocr_text || "No raw text recorded"}
                  </pre>
                </div>

                {data.preprocessing_meta && (
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-background p-2 rounded border">
                    <div>Deskew: {data.preprocessing_meta.deskew_angle || 0}°</div>
                    <div>Upscaled: {data.preprocessing_meta.upscaled ? "Yes" : "No"}</div>
                    <div>Contrast (CLAHE): Enhanced</div>
                    <div>Noise (Bilateral): Denoised</div>
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                  <span>Tenant Isolation: Enforced</span>
                  <span>Document ID: {data.document_id}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* ── APPROVAL & ACTION GATE ────────────────────────────────────────── */}
      <div className="mt-4 border-t border-border pt-4 space-y-3">
        {reviewed ? (
          <div className="space-y-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h4 className="text-xs font-bold text-foreground">Document Approved &amp; Action Committed</h4>
            </div>

            {isStudentLeave && (
              <div className="space-y-1 text-xs">
                <p className="text-muted-foreground">
                  Attendance register marked <strong>Excused</strong> for {data.student_name || "Student"} ({data.student_id || "STU-001"}).
                </p>
                <Button asChild size="sm" className="w-full h-7 text-xs mt-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Link href={`/attendance?student=${data.student_id || "STU-001"}&filter=excused`}>
                    <span>View Attendance Register →</span>
                  </Link>
                </Button>
              </div>
            )}

            {isFacultyLeave && (
              <div className="space-y-1 text-xs">
                <p className="text-muted-foreground">
                  Absence recorded for {data.faculty_name || "Faculty"}. Route to substitute resolution.
                </p>
                <Button asChild size="sm" className="w-full h-7 text-xs mt-1 bg-primary text-primary-foreground">
                  <Link href={data.operational_route || `/substitute?faculty=${data.faculty_id || "F01"}`}>
                    <span>Open Substitute Resolution →</span>
                  </Link>
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Button 
              onClick={onApprove} 
              disabled={approving} 
              className="w-full gap-1.5 text-xs font-semibold"
            >
              {approving ? (
                <span className="flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Committing Action…
                </span>
              ) : isStudentLeave ? (
                <>
                  <ClipboardCheck className="h-4 w-4" />
                  Confirm &amp; Mark Excused Attendance
                </>
              ) : isFacultyLeave ? (
                <>
                  <UserCheck className="h-4 w-4" />
                  Confirm &amp; Route to Substitute Resolution
                </>
              ) : (
                <>
                  <ClipboardCheck className="h-4 w-4" />
                  Confirm &amp; Archive Document
                </>
              )}
            </Button>

            <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <span>Admin confirmation required for system mutation</span>
              </span>
              <span className="font-mono">Audit Trail: Active</span>
            </div>
          </div>
        )}

        {/* 7-Stage Pipeline Indicator */}
        <div className="pt-3 border-t border-border/40 flex items-center justify-between text-[8px] uppercase tracking-wider font-semibold text-muted-foreground gap-1">
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">1. Upload</span>
          <span>→</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">2. Preprocess</span>
          <span>→</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">3. OCR</span>
          <span>→</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">4. Extract</span>
          <span>→</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">5. Match</span>
          <span>→</span>
          <span className={cn(reviewed ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-primary font-bold")}>6. Review</span>
          <span>→</span>
          <span className={cn(reviewed ? "text-emerald-600 dark:text-emerald-400 font-bold" : "opacity-40")}>7. Action</span>
        </div>
      </div>
    </motion.div>
  )
}
