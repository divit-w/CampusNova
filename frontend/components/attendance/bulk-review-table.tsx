"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, X, XCircle } from "lucide-react"
import type { BulkAttendanceResponse, ProcessedAttendanceRow } from "@/lib/types"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface BulkReviewTableProps {
  data: BulkAttendanceResponse
  batchDate: string
  detectedDate?: string
  onCancel: () => void
  onSuccess: () => void
}

function formatDateDisplay(isoDate?: string): string {
  if (!isoDate) return "—"
  try {
    const parts = isoDate.split("-")
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10) - 1
      const day = parseInt(parts[2], 10)
      const d = new Date(year, month, day)
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    }
  } catch (e) {}
  return isoDate
}

export function BulkReviewTable({ data, batchDate, detectedDate, onCancel, onSuccess }: BulkReviewTableProps) {
  const [records, setRecords] = useState<ProcessedAttendanceRow[]>(data.records)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Calculate stats based on current state (excluding exceptions which are uncommittable)
  const committableRecords = records.filter((r) => r.decision !== "EXCEPTION")
  const canFinalize = committableRecords.length > 0 && records.every(r => r.decision !== "REVIEW" || (r.student_id && r.status))

  function updateRow(rowId: string, field: "student_id" | "status", value: string) {
    setRecords((prev) => 
      prev.map((r) => {
        if (r.row_id !== rowId) return r
        const newRow = { ...r, [field]: value }
        return newRow
      })
    )
  }

  async function handleFinalize() {
    if (submitting || !canFinalize) return
    setSubmitting(true)
    setError(null)
    
    try {
      await api.finalizeBulkRegister({
        batch_id: data.batch_id,
        date: batchDate || data.date || new Date().toISOString().slice(0, 10),
        class_section: data.class_section || "Unknown",
        records: committableRecords
      })
      onSuccess()
    } catch (err: any) {
      let msg = "Failed to finalize attendance."
      if (err.message) msg = err.message
      if (err.detail && typeof err.detail === "string") msg = err.detail
      else if (err.detail?.message) msg = err.detail.message
      
      setError(msg)
      setSubmitting(false)
    }
  }

  const isOverridden = Boolean(detectedDate && batchDate && detectedDate !== batchDate)

  return (
    <div className="flex flex-col space-y-4">
      {/* Target Date Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-surface/60 p-3.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Batch Attendance Date:</span>
            <span className="text-sm font-bold text-foreground bg-primary/10 px-2.5 py-0.5 rounded-md border border-primary/20">
              {formatDateDisplay(batchDate)}
            </span>
          </div>
          {isOverridden && (
            <p className="text-xs text-warning mt-1 flex items-center gap-1">
              <span>⚠ Overridden from detected date:</span>
              <span className="font-semibold">{formatDateDisplay(detectedDate)}</span>
            </p>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Class / Section: <span className="font-semibold text-foreground">{data.class_section || "Grade 10-A"}</span>
        </div>
      </div>

      {/* Overall Decision Banner */}
      <Card className={cn(
        "p-4 flex items-center justify-between border-l-4",
        data.overall_decision === "AUTO" ? "border-l-success bg-success/5" :
        data.overall_decision === "REVIEW" ? "border-l-warning bg-warning/5" :
        "border-l-destructive bg-destructive/5"
      )}>
        <div>
          <h3 className="font-semibold text-sm">
            Batch Status: {data.overall_decision}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {data.decision_reason || "Requires human review."}
          </p>
        </div>
        <div className="flex gap-4 text-xs font-medium">
          <div className="flex flex-col items-center"><span className="text-success">{data.valid_rows}</span>Valid</div>
          <div className="flex flex-col items-center"><span className="text-warning">{data.review_rows}</span>Review</div>
          <div className="flex flex-col items-center"><span className="text-destructive">{data.exception_rows}</span>Exception</div>
        </div>
      </Card>

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Student ID</th>
              <th className="px-4 py-3 text-left font-medium">Name (Extracted)</th>
              <th className="px-4 py-3 text-left font-medium">Attendance</th>
              <th className="px-4 py-3 text-left font-medium">Validations</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {records.map((row) => {
              const isException = row.decision === "EXCEPTION"
              const isReview = row.decision === "REVIEW"
              
              return (
                <tr key={row.row_id} className={cn(isException && "opacity-60 bg-muted/50")}>
                  <td className="px-4 py-3">
                    {isException ? <XCircle className="h-5 w-5 text-destructive" /> :
                     isReview ? <AlertTriangle className="h-5 w-5 text-warning" /> :
                     <CheckCircle2 className="h-5 w-5 text-success" />}
                  </td>
                  <td className="px-4 py-3">
                    {isException ? (
                      <span className="text-muted-foreground">{row.student_id || "—"}</span>
                    ) : (
                      <Input 
                        value={row.student_id || ""} 
                        onChange={(e) => updateRow(row.row_id, "student_id", e.target.value)}
                        className="h-8 w-[120px]"
                        placeholder="ID"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {row.student_name || "Unknown"}
                  </td>
                  <td className="px-4 py-3">
                     {isException ? (
                      <span className="text-muted-foreground capitalize">{row.status || "—"}</span>
                     ) : (
                      <Select value={row.status || ""} onValueChange={(val) => updateRow(row.row_id, "status", val)}>
                        <SelectTrigger className="h-8 w-[120px]">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="present">Present</SelectItem>
                          <SelectItem value="absent">Absent</SelectItem>
                          <SelectItem value="leave">Leave</SelectItem>
                        </SelectContent>
                      </Select>
                     )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {Object.values(row.validations).map((v, i) => (
                        !v.passed ? (
                          <span key={i} className={cn("text-xs", v.severity === "CRITICAL" ? "text-destructive" : "text-warning")}>
                            • {v.message}
                          </span>
                        ) : null
                      ))}
                      {Object.values(row.validations).every(v => v.passed) && (
                        <span className="text-xs text-success">• All checks passed</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between pt-4">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleFinalize} disabled={!canFinalize || submitting}>
          {submitting ? "Finalizing..." : `Finalize ${committableRecords.length} Records`}
        </Button>
      </div>
    </div>
  )
}
