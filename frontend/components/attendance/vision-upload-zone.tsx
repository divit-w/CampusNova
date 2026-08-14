"use client"

import { useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, CheckCircle2, File as FileIcon, ScanLine, UploadCloud, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { ErrorState } from "@/components/states"
import { api } from "@/lib/api"
import type { ProcessSheetResponse } from "@/lib/types"
import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

const VALID_EXT = [".jpg", ".jpeg", ".png", ".pdf"]

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

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
 * Drag-and-drop bulk sheet upload → POST /attendance/process-sheet.
 * The backend runs Vision OCR (OpenRouter) on the uploaded photo/PDF and
 * upserts per-student present/absent rows for the given date.
 */
export function VisionUploadZone() {
  const [date, setDate] = useState(todayIso())
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ProcessSheetResponse | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFile(f: File | undefined | null) {
    if (!f) return
    setResult(null)
    setError(null)
    setValidationError(null)
    if (!isValidFile(f)) {
      setValidationError("Unsupported file type. Use JPG, PNG, or PDF.")
      return
    }
    setFile(f)
  }

  async function submit() {
    if (!file || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.processAttendanceSheet(file, date)
      setResult(res)
      setFile(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
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

      <div className="mt-4 space-y-1.5">
        <Label htmlFor="sheet-date">Date</Label>
        <Input id="sheet-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-[200px]" />
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
          "mt-4 flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-300 ease-spring",
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
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-soft"
              onClick={(e) => e.stopPropagation()}
            >
              <FileIcon className="h-5 w-5 shrink-0 text-primary" />
              <div className="text-left">
                <p className="max-w-[220px] truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                aria-label="Remove file"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
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
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring}
            className="mt-4 flex items-center gap-2.5 rounded-xl border border-success/20 bg-success/[0.06] px-4 py-3"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <p className="text-pretty text-sm leading-snug text-foreground">{result.message}</p>
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
