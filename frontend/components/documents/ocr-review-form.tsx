"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileSearch, ShieldCheck, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/states"
import type { DocumentExtractResponse } from "@/lib/types"
import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

function normalizeConfidenceText(score: string) {
  const tone = (score || "").toLowerCase()
  if (tone.includes("high")) return "High"
  if (tone.includes("medium")) return "Medium"
  if (tone.includes("low")) return "Low"
  return "Partial" 
}

function confidenceTone(score: string) {
  const tone = (score || "").toLowerCase()
  if (tone.includes("high")) return "bg-success/12 text-success"
  if (tone.includes("medium")) return "bg-warning/15 text-[hsl(30_60%_28%)]"
  if (tone.includes("low")) return "bg-destructive/10 text-destructive"
  return "bg-secondary/40 text-muted-foreground" // fallback for "Partial"
}

function confidenceBadge(score: string) {
  const normalized = normalizeConfidenceText(score)
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", confidenceTone(score))}>
      {normalized} confidence
    </span>
  )
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
  const [verifiedState, setVerifiedState] = useState<Record<string, boolean>>({})

  const toggleVerify = (key: string) => {
    setVerifiedState(prev => ({ ...prev, [key]: !prev[key] }))
  }

  if (!data) {
    return (
      <div className="flex h-full flex-col rounded-xl border border-border glass-surface p-4 shadow-soft sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <FileSearch className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">OCR review</p>
            <p className="text-xs text-muted-foreground">Verify and correct extracted fields</p>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <EmptyState icon={FileSearch} title="Nothing extracted yet" description="Upload a document on the left and run OCR extraction to review its fields here." />
        </div>
      </div>
    )
  }

  const categoryLower = (data?.document_category || "").toLowerCase()
  const isStudentDoc = 
    categoryLower.includes("student") || 
    categoryLower.includes("leave") || 
    categoryLower.includes("application") ||
    categoryLower.includes("admission")

  const hasLowConfidence = data?.extracted_fields?.some(
    (f, i) => (f.confidence || "").toLowerCase() !== "high" && !verifiedState[`field-${i}`]
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="flex h-full flex-col rounded-xl border border-border glass-surface p-4 shadow-soft sm:p-5"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <FileSearch className="h-[18px] w-[18px]" />
        </span>
        <div className="flex-1 min-w-0">
          <Select 
            value={data.document_category || "Uncategorized Document"} 
            onValueChange={(val) => onFieldChange("document_category", val)}
          >
            <SelectTrigger className="h-7 border-none bg-transparent p-0 px-1 text-sm font-semibold shadow-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 [&>svg]:ml-1">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Leave Application">Leave Application</SelectItem>
              <SelectItem value="Financial Report">Financial Report</SelectItem>
              <SelectItem value="Handwritten Note">Handwritten Note</SelectItem>
              <SelectItem value="Signature Sheet">Signature Sheet</SelectItem>
              <SelectItem value="Uncategorized Document">Uncategorized Document</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground px-1">Doc ID {data.document_id.slice(0, 8)}</p>
        </div>
      </div>

      {data.decision === "EXCEPTION" && (
        <div className="mt-4 flex flex-col gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Critical Exception</p>
          </div>
          <p className="text-xs text-foreground leading-relaxed">{data.decision_reason}</p>
        </div>
      )}

      {data.decision === "REVIEW" && (
        <div className="mt-4 flex flex-col gap-1.5 rounded-xl border border-warning/40 bg-warning/15 px-3.5 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[hsl(30_70%_35%)]" />
            <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(30_70%_35%)]">Human Review Required</p>
          </div>
          <p className="text-xs text-foreground leading-relaxed">{data.decision_reason}</p>
        </div>
      )}

      {data.decision === "AUTO" && (
        <div className="mt-4 flex flex-col gap-1.5 rounded-xl border border-success/30 bg-success/10 px-3.5 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <p className="text-xs font-semibold uppercase tracking-wider text-success">System Cleared</p>
          </div>
          <p className="text-xs text-foreground leading-relaxed">System cleared for automated workflow</p>
        </div>
      )}

      {isStudentDoc && data.student_verified !== undefined && data.student_verified !== null && (
        <div className="mt-4 flex items-center justify-center">
          {data.student_verified ? (
            <div className="flex w-full items-center gap-2 rounded-xl border border-success/20 bg-success/10 px-3.5 py-2.5 shadow-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              <p className="text-xs font-medium text-success">
                Verified Student: Enrolled in {data.matched_student_class || "Class"}
              </p>
            </div>
          ) : (
            <div className="flex w-full items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-2.5 shadow-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs font-medium text-[hsl(30_70%_35%)]">
                Unregistered Student — Review profile
              </p>
            </div>
          )}
        </div>
      )}
      
      {data.summary && (
        <div className="mt-4 rounded-xl border border-border bg-secondary/30 px-3.5 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{data.summary}</p>
        </div>
      )}

      {hasLowConfidence && !reviewed && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning/[0.08] px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(30_70%_35%)]" />
          <p className="text-pretty text-xs leading-relaxed text-[hsl(30_60%_28%)]">
            Low-confidence fields detected — please verify or edit the values below before approving.
          </p>
        </div>
      )}

      <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-2">
        {isStudentDoc && (
          <div className="space-y-4 rounded-xl border border-border bg-background p-3.5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Student & Leave Details</p>
            
            <div className="space-y-1.5">
              <Label htmlFor="student_name">Student Name</Label>
              <Input id="student_name" value={data.student_name || ""} onChange={(e) => onFieldChange("student_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="student_id">Student ID</Label>
              <Input id="student_id" value={data.student_id || ""} onChange={(e) => onFieldChange("student_id", e.target.value)} />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="leave_start_date">Leave Start Date</Label>
                <Input id="leave_start_date" placeholder="YYYY-MM-DD" value={data.leave_start_date || ""} onChange={(e) => onFieldChange("leave_start_date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leave_end_date">Leave End Date</Label>
                <Input id="leave_end_date" placeholder="YYYY-MM-DD" value={data.leave_end_date || ""} onChange={(e) => onFieldChange("leave_end_date", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave_type">Leave Type / Reason</Label>
              <Input id="leave_type" value={data.leave_type || ""} onChange={(e) => onFieldChange("leave_type", e.target.value)} />
            </div>
          </div>
        )}

        {(!data.extracted_fields || data.extracted_fields.length === 0) && !isStudentDoc ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/30 px-3.5 py-3">
            <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
              No granular fields detected. Summary and image vector will be indexed directly to the Knowledge Base.
            </p>
          </div>
        ) : (
          data.extracted_fields?.map((field, index) => (
            <div key={index} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={`ocr-field-${index}`}>{field.key}</Label>
                <div className="flex items-center gap-2">
                  {confidenceBadge(field.confidence || "high")}
                  {(field.confidence || "").toLowerCase() !== "high" && (
                  <button
                    type="button"
                    onClick={() => toggleVerify(`field-${index}`)}
                    className={cn(
                      "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                      verifiedState[`field-${index}`] ? "text-success" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {verifiedState[`field-${index}`] ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" />
                        Verified by Admin
                      </>
                    ) : (
                      <>
                        <span className="h-3 w-3 rounded-sm border border-current opacity-70"></span>
                        Verify
                      </>
                    )}
                  </button>
                  )}
                </div>
              </div>
              <Input
                id={`ocr-field-${index}`}
                value={field.value || ""}
                onChange={(e) => onFieldChange(index, e.target.value)}
                className={cn(
                  (field.confidence || "").toLowerCase() !== "high" && 
                  "border-warning/50 bg-warning/[0.03] focus-visible:ring-warning/30"
                )}
              />
            </div>
          ))
        )}
      </div>

      {data.validations && Object.keys(data.validations).length > 0 && (
        <div className="mt-4 space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">System Validations</p>
          <div className="space-y-2">
            {Object.entries(data.validations).map(([key, val]) => {
              const isPassed = val.passed
              const isCritical = val.severity === "CRITICAL"
              
              let Icon = CheckCircle2
              let colorClass = "text-success"
              let bgClass = "bg-success/[0.08] border-success/20"
              let title = "Passed"
              
              if (!isPassed) {
                if (isCritical) {
                  Icon = XCircle
                  colorClass = "text-destructive"
                  bgClass = "bg-destructive/[0.08] border-destructive/20"
                  title = "Critical"
                } else {
                  Icon = AlertTriangle
                  colorClass = "text-warning"
                  bgClass = "bg-warning/[0.08] border-warning/30"
                  title = "Review"
                }
              }
              
              return (
                <div key={key} className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-sm", bgClass)}>
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", colorClass)} />
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("text-xs font-semibold uppercase tracking-wider", colorClass)}>{title}</p>
                      {val.code && <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-mono">{val.code}</span>}
                    </div>
                    <p className="text-xs text-foreground/90 leading-relaxed pr-2">{val.message}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-border pt-4">
        {reviewed ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-success/20 bg-success/[0.06] px-3.5 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <p className="text-pretty text-xs leading-relaxed text-foreground">
              {isStudentDoc 
                ? "Document verified and finalized. Central attendance register updated."
                : "Document indexed and saved successfully to the knowledge base."}
            </p>
          </div>
        ) : (
          <Button 
            onClick={onApprove} 
            disabled={approving || hasLowConfidence || data.decision === "EXCEPTION"} 
            className="w-full gap-1.5"
            variant={data.decision === "EXCEPTION" ? "destructive" : "default"}
          >
            {approving ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {isStudentDoc ? "Approving..." : "Saving..."}
              </span>
            ) : data.decision === "EXCEPTION" ? (
              <>
                <XCircle className="h-4 w-4" />
                Resolve Exception First
              </>
            ) : data.decision === "AUTO" ? (
              <>
                <ClipboardCheck className="h-4 w-4" />
                {isStudentDoc ? "Approve / Continue" : "Save / Continue"}
              </>
            ) : (
              <>
                <ClipboardCheck className="h-4 w-4" />
                {isStudentDoc ? "Review & Approve Leave" : "Review & Save to Knowledge Base"}
              </>
            )}
          </Button>
        )}
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
          Corrections above are held for this session — indexing happens automatically at extraction time.
        </p>

        {/* Pipeline Status View */}
        <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">
          <div className="flex items-center gap-1 text-success">
            <CheckCircle2 className="h-3 w-3" /> <span>Extracted</span>
          </div>
          <div className="h-[1px] flex-1 mx-2 bg-border"></div>
          <div className="flex items-center gap-1 text-success">
            <CheckCircle2 className="h-3 w-3" /> <span>Validated</span>
          </div>
          <div className="h-[1px] flex-1 mx-2 bg-border"></div>
          <div className={cn("flex items-center gap-1", 
            data.decision === "EXCEPTION" ? "text-destructive" : 
            data.decision === "REVIEW" ? "text-warning" : 
            data.decision === "AUTO" ? "text-success" : "")}
          >
            {data.decision === "EXCEPTION" ? <XCircle className="h-3 w-3" /> : 
             data.decision === "REVIEW" ? <AlertTriangle className="h-3 w-3" /> : 
             data.decision === "AUTO" ? <CheckCircle2 className="h-3 w-3" /> : 
             <CheckCircle2 className="h-3 w-3" />}
            <span>{data.decision || "Routed"}</span>
          </div>
          <div className="h-[1px] flex-1 mx-2 bg-border"></div>
          <div className={cn("flex items-center gap-1", reviewed ? "text-success" : "")}>
            {reviewed ? <CheckCircle2 className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-current opacity-50" />}
            <span>Action</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
