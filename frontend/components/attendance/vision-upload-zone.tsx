"use client"

import { useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, CheckCircle2, File as FileIcon, ScanLine, UploadCloud, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ErrorState } from "@/components/states"
import { api } from "@/lib/api"
import type { BulkAttendanceResponse } from "@/lib/types"
import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { BulkReviewTable } from "./bulk-review-table"

const VALID_EXT = [".jpg", ".jpeg", ".png", ".pdf"]
/** 5 MB client-side guard — keeps requests well under the 10 MB backend limit
 *  and provides an instant, friendly error before any network round-trip. */
const MAX_FILE_BYTES = 5 * 1024 * 1024

function isValidFile(file: File) {
  const ext = `.${file.name.split(".").pop()?.toLowerCase()}`
  return VALID_EXT.includes(ext)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

/**
 * Drag-and-drop bulk sheet upload → POST /attendance/process-bulk-register.
 * The backend runs Vision OCR (OpenRouter) on the uploaded photo/PDF and
 * returns row-level validation data.
 */
export function VisionUploadZone({ selectedDate }: { selectedDate?: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BulkAttendanceResponse | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  
  // Date Mismatch States
  const [mismatchResolved, setMismatchResolved] = useState<boolean>(false)
  const [dateChoice, setDateChoice] = useState<"detected" | "selected">("selected")
  const [chosenDate, setChosenDate] = useState<string>("")
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFile(f: File | undefined | null) {
    if (!f) return
    setResult(null)
    setMismatchResolved(false)
    setChosenDate("")
    setSuccessMsg(null)
    setError(null)
    setValidationError(null)
    if (!isValidFile(f)) {
      setValidationError("Unsupported file type. Use JPG, PNG, or PDF.")
      return
    }
    if (f.size > MAX_FILE_BYTES) {
      setValidationError(
        `File too large (${formatBytes(f.size)}). Maximum upload size is 5 MB.`,
      )
      return
    }
    setFile(f)
  }

  async function submit() {
    if (!file || loading) return
    setLoading(true)
    setError(null)
    setSuccessMsg(null)
    setMismatchResolved(false)
    setChosenDate("")
    try {
      const res = await api.processBulkRegister(file)
      setResult(res)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  function handleCancel() {
    setResult(null)
    setFile(null)
    setMismatchResolved(false)
    setChosenDate("")
  }

  function handleSuccess() {
    setResult(null)
    setFile(null)
    setMismatchResolved(false)
    setChosenDate("")
    setSuccessMsg("Attendance records finalized successfully.")
    setTimeout(() => setSuccessMsg(null), 5000)
  }

  if (result) {
    const detectedDate = result.date || ""
    const pageDate = selectedDate || new Date().toISOString().slice(0, 10)
    const hasMismatch = Boolean(detectedDate && pageDate && detectedDate !== pageDate)

    // Date Mismatch Intercept Dialog
    if (hasMismatch && !mismatchResolved) {
      return (
        <Card className="flex flex-col p-6 lg:col-span-2 border-warning/40 bg-warning/[0.03] shadow-lg">
          <div className="flex items-center gap-3 border-b border-border/60 pb-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-warning/15 text-warning">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-foreground">Attendance Date Mismatch</h3>
              <p className="text-xs text-muted-foreground">
                The date detected from the uploaded sheet differs from the currently selected page date.
              </p>
            </div>
          </div>

          <div className="my-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border/80 bg-surface/60 p-4">
              <span className="text-xs font-medium text-muted-foreground">Page Selected Date</span>
              <p className="text-base font-semibold text-foreground mt-1">
                {formatDateDisplay(pageDate)}
              </p>
              <span className="text-[11px] font-mono text-muted-foreground">{pageDate}</span>
            </div>

            <div className="rounded-xl border border-border/80 bg-surface/60 p-4">
              <span className="text-xs font-medium text-muted-foreground">Detected from Register (OCR)</span>
              <p className="text-base font-semibold text-primary mt-1">
                {formatDateDisplay(detectedDate)}
              </p>
              <span className="text-[11px] font-mono text-muted-foreground">{detectedDate}</span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium text-foreground mb-3">Which date should this batch use?</p>
            <div className="flex flex-col gap-2.5">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-accent/50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="dateChoice"
                  value="detected"
                  checked={dateChoice === "detected"}
                  onChange={() => setDateChoice("detected")}
                  className="h-4 w-4 text-primary"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Use detected date — {formatDateDisplay(detectedDate)}</p>
                  <p className="text-xs text-muted-foreground">Mark attendance against the date printed on the uploaded register sheet.</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-accent/50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="dateChoice"
                  value="selected"
                  checked={dateChoice === "selected"}
                  onChange={() => setDateChoice("selected")}
                  className="h-4 w-4 text-primary"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Use selected date — {formatDateDisplay(pageDate)}</p>
                  <p className="text-xs text-muted-foreground">Override and mark attendance against the date currently active on the page.</p>
                </div>
              </label>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <Button variant="outline" onClick={handleCancel}>Cancel</Button>
            <Button onClick={() => {
              setChosenDate(dateChoice === "detected" ? detectedDate : pageDate)
              setMismatchResolved(true)
            }}>
              Continue to Review
            </Button>
          </div>
        </Card>
      )
    }

    const finalBatchDate = chosenDate || detectedDate || pageDate

    return (
      <Card className="flex flex-col p-5 lg:col-span-2">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <ScanLine className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">Review Attendance</p>
            <p className="text-xs text-muted-foreground">Verify extracted rows before committing to the database</p>
          </div>
        </div>
        <BulkReviewTable 
          data={result} 
          batchDate={finalBatchDate}
          detectedDate={detectedDate}
          onCancel={handleCancel} 
          onSuccess={handleSuccess} 
        />
      </Card>
    )
  }

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <ScanLine className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="text-sm font-semibold leading-tight">Vision OCR bulk sheet</p>
          <p className="text-xs text-muted-foreground">Photograph a paper register — we&apos;ll extract it</p>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          pickFile(e.dataTransfer.files?.[0])
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload attendance sheet"
        className={cn(
          "mt-4 flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all duration-300 ease-spring",
          dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/40 hover:bg-accent/40",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf"
          className="sr-only"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        <AnimatePresence mode="wait">
          {file ? (
            <motion.div
              key="file"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 rounded-xl border border-border glass-surface px-4 py-3 shadow-soft"
              onClick={(e) => e.stopPropagation()}
            >
              <FileIcon className="h-5 w-5 shrink-0 text-primary" />
              <div className="text-left">
                <p className="max-w-[220px] truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                aria-label="Remove file"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-secondary text-muted-foreground">
                <UploadCloud className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-medium">Drop a register photo or PDF</p>
              <p className="mt-1 text-xs text-muted-foreground">or click to browse · JPG, PNG, PDF</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Button onClick={submit} disabled={!file || loading} className="mt-4 gap-1.5">
        <ScanLine className="h-4 w-4" />
        {loading ? "Extracting attendance…" : "Process sheet"}
      </Button>

      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring}
            className="mt-4 flex items-center gap-2.5 rounded-xl border border-success/20 bg-success/[0.06] px-4 py-3"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <p className="text-pretty text-sm leading-snug text-foreground">{successMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {validationError && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{validationError}</p>
        </div>
      )}

      {error ? (
        <div className="mt-2">
          <ErrorState error={error} onRetry={file ? submit : undefined} />
        </div>
      ) : null}
    </Card>
  )
}
