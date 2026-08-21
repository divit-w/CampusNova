"use client"

import { useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, CheckCircle2, File as FileIcon, ScanLine, UploadCloud, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ErrorState } from "@/components/states"
import { api } from "@/lib/api"
<<<<<<< Updated upstream
import type { ProcessSheetResponse, SyncBulkResponse, ExtractedAttendanceRecord } from "@/lib/types"
=======
import type { BulkAttendanceResponse } from "@/lib/types"
>>>>>>> Stashed changes
import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { BulkReviewTable } from "./bulk-review-table"

function SimpleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  )
}

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

/**
 * Drag-and-drop bulk sheet upload → POST /attendance/process-bulk-register.
 * The backend runs Vision OCR (OpenRouter) on the uploaded photo/PDF and
 * returns row-level validation data.
 */
export function VisionUploadZone() {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
<<<<<<< Updated upstream
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<{ message: string } | null>(null)
  const [extractedRecords, setExtractedRecords] = useState<ExtractedAttendanceRecord[] | null>(null)
=======
  const [result, setResult] = useState<BulkAttendanceResponse | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
>>>>>>> Stashed changes
  const [error, setError] = useState<unknown>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFile(f: File | undefined | null) {
    if (!f) return
    setResult(null)
<<<<<<< Updated upstream
    setExtractedRecords(null)
=======
    setSuccessMsg(null)
>>>>>>> Stashed changes
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
    try {
<<<<<<< Updated upstream
      const res = await api.processAttendanceSheet(file, date)
      if (res.records && res.records.length > 0) {
        setExtractedRecords(res.records)
      } else {
        setResult({ message: "No records found to extract." })
      }
      setFile(null)
=======
      const res = await api.processBulkRegister(file)
      setResult(res)
>>>>>>> Stashed changes
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

<<<<<<< Updated upstream
  async function sync() {
    if (!extractedRecords || syncing) return
    setSyncing(true)
    setError(null)
    try {
      const res = await api.syncAttendanceRecords(date, extractedRecords)
      setResult({ message: res.message })
      setExtractedRecords(null)
    } catch (err) {
      setError(err)
    } finally {
      setSyncing(false)
    }
  }

  function toggleStatus(id: string) {
    setExtractedRecords((prev) => 
      prev ? prev.map((r) => r.student_id === id ? { ...r, status: r.status === "present" ? "absent" : "present" } : r) : null
=======
  function handleCancel() {
    setResult(null)
    setFile(null)
  }

  function handleSuccess() {
    setResult(null)
    setFile(null)
    setSuccessMsg("Attendance records finalized successfully.")
    setTimeout(() => setSuccessMsg(null), 5000)
  }

  if (result) {
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
        <BulkReviewTable data={result} onCancel={handleCancel} onSuccess={handleSuccess} />
      </Card>
>>>>>>> Stashed changes
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

      <Button onClick={submit} disabled={!file || loading || !!extractedRecords} className="mt-4 gap-1.5">
        <ScanLine className="h-4 w-4" />
        {loading ? "Extracting attendance…" : "Process sheet"}
      </Button>

      <AnimatePresence>
<<<<<<< Updated upstream
        {extractedRecords && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <div className="rounded-xl border border-border bg-surface/40 backdrop-blur-2xl p-4">
              <h4 className="mb-3 text-sm font-semibold text-foreground">Review Extracted Records</h4>
              <div className="flex max-h-[250px] flex-col gap-2 overflow-y-auto pr-2">
                {extractedRecords.map((r) => (
                  <div key={r.student_id} className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-2.5">
                    <div>
                      <p className="text-sm font-medium">{r.name || r.student_id}</p>
                      <p className="text-xs text-muted-foreground">{r.student_id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs font-medium", r.status === "present" ? "text-success" : "text-muted-foreground")}>
                        {r.status === "present" ? "Present" : "Absent"}
                      </span>
                      <SimpleSwitch
                        checked={r.status === "present"}
                        onChange={() => toggleStatus(r.student_id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={sync} disabled={syncing} className="mt-4 w-full gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                {syncing ? "Syncing..." : "Confirm & Sync Attendance"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {result && (
=======
        {successMsg && (
>>>>>>> Stashed changes
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
