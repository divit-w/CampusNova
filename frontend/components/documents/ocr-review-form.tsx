"use client"

import { motion } from "framer-motion"
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileSearch, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EmptyState } from "@/components/states"
import type { DocumentExtractResponse } from "@/lib/types"
import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

function confidenceBadge(score: number) {
  const pct = Math.round(score * 100)
  const tone = score >= 0.75 ? "bg-success/12 text-success" : score >= 0.5 ? "bg-warning/15 text-[hsl(30_60%_28%)]" : "bg-destructive/10 text-destructive"
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", tone)}>{pct}% confidence</span>
  )
}

export function OcrReviewForm({
  data,
  reviewed,
  onFieldChange,
  onApprove,
}: {
  data: DocumentExtractResponse | null
  reviewed: boolean
  onFieldChange: (field: "student_name" | "admission_number" | "grade_level", value: string) => void
  onApprove: () => void
}) {
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
        <div>
          <p className="text-sm font-semibold leading-tight">OCR review</p>
          <p className="text-xs text-muted-foreground">Doc ID {data.document_id.slice(0, 8)}</p>
        </div>
      </div>

      {data.requires_review && !reviewed && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning/[0.08] px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(30_70%_35%)]" />
          <p className="text-pretty text-xs leading-relaxed text-[hsl(30_60%_28%)]">
            Low-confidence fields detected — please verify the values below before approving.
          </p>
        </div>
      )}

      <div className="mt-4 flex-1 space-y-4 overflow-y-auto">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="ocr-student-name">Student name</Label>
            {confidenceBadge(data.confidence_scores.student_name)}
          </div>
          <Input
            id="ocr-student-name"
            value={data.student_name}
            onChange={(e) => onFieldChange("student_name", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="ocr-admission-number">Admission number</Label>
            {confidenceBadge(data.confidence_scores.admission_number)}
          </div>
          <Input
            id="ocr-admission-number"
            value={data.admission_number}
            onChange={(e) => onFieldChange("admission_number", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ocr-grade-level">Grade level</Label>
          <Input
            id="ocr-grade-level"
            type="number"
            value={data.grade_level}
            onChange={(e) => onFieldChange("grade_level", e.target.value)}
            className="max-w-[140px]"
          />
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        {reviewed ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-success/20 bg-success/[0.06] px-3.5 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <p className="text-pretty text-xs leading-relaxed text-foreground">
              Marked as reviewed. This record was already indexed into ChromaDB during extraction.
            </p>
          </div>
        ) : (
          <Button onClick={onApprove} className="w-full gap-1.5">
            <ClipboardCheck className="h-4 w-4" />
            Approve & mark reviewed
          </Button>
        )}
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
          Corrections above are held for this session — indexing happens automatically at extraction time.
        </p>
      </div>
    </motion.div>
  )
}
