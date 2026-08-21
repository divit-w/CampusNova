"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { AnimatePresence, motion } from "framer-motion"
import { ScanSearch } from "lucide-react"
import { ErrorState, PageHeading } from "@/components/states"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import type { DocumentExtractResponse } from "@/lib/types"

// Both panes depend on the picked file / OCR result and do real work (image
// preview rendering, field-by-field review UI) that isn't needed until a
// user actually drops a file in, so they're split out of the initial bundle.
const DocumentPreviewPane = dynamic(
  () => import("@/components/documents/document-preview-pane").then((m) => m.DocumentPreviewPane),
  { loading: () => <Skeleton className="h-[420px] w-full rounded-xl" /> },
)
const OcrReviewForm = dynamic(
  () => import("@/components/documents/ocr-review-form").then((m) => m.OcrReviewForm),
  { loading: () => <Skeleton className="h-[420px] w-full rounded-xl" /> },
)

const VALID_TYPES = ["image/jpeg", "image/png", "image/webp"]

export default function DocumentsPage() {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [data, setData] = useState<DocumentExtractResponse | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      if (progressTimer.current) clearInterval(progressTimer.current)
    }
  }, [previewUrl])

  function pickFile(f: File | undefined | null) {
    if (!f) return
    setError(null)
    setValidationError(null)
    if (!VALID_TYPES.includes(f.type)) {
      setValidationError("Unsupported file type. Use JPG, PNG, or WEBP.")
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    setData(null)
    setReviewed(false)
  }

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setData(null)
    setReviewed(false)
    setError(null)
  }

  async function extract() {
    if (!file || extracting) return
    setExtracting(true)
    setError(null)
    setProgress(8)

    // Simulate a determinate progress bar — the browser fetch API doesn't expose
    // upload/processing progress, so we ease toward 90% while awaiting the response.
    progressTimer.current = setInterval(() => {
      setProgress((p) => (p < 88 ? p + (88 - p) * 0.12 + 1 : p))
    }, 250)

    try {
      const res = await api.extractDocument(file)
      setProgress(100)
      setData(res)
      setReviewed(false)
    } catch (err) {
      setError(err)
    } finally {
      if (progressTimer.current) clearInterval(progressTimer.current)
      setTimeout(() => setExtracting(false), 300)
    }
  }

  function updateField(field: "student_name" | "admission_number" | "grade_level", value: string) {
    setData((prev) => {
      if (!prev) return prev
      if (field === "grade_level") {
        const parsed = Number(value)
        return { ...prev, grade_level: Number.isNaN(parsed) ? prev.grade_level : parsed }
      }
      return { ...prev, [field]: value }
    })
  }

  return (
    <div>
      <PageHeading
        icon={<ScanSearch className="h-5 w-5" />}
        title={<span className="text-gradient-brand">Document Intake &amp; OCR</span>}
        description="Digitize paper records — upload a scan, run OCR, then verify and approve extracted fields before they index into ChromaDB."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <DocumentPreviewPane
          file={file}
          previewUrl={previewUrl}
          dragging={dragging}
          onDragging={setDragging}
          onPickFile={pickFile}
          onClear={clearFile}
          onExtract={extract}
          extracting={extracting}
          progress={progress}
        />
        <OcrReviewForm data={data} reviewed={reviewed} onFieldChange={updateField} onApprove={() => setReviewed(true)} />
      </div>

      {validationError && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-2.5">
          <p className="text-sm text-destructive">{validationError}</p>
        </div>
      )}

      <AnimatePresence>
        {error ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 rounded-xl glass-surface">
            <ErrorState error={error} onRetry={extract} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
