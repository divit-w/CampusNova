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

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { width, height } = img
      const MAX_DIM = 1200
      
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width)
          width = MAX_DIM
        } else {
          width = Math.round((width * MAX_DIM) / height)
          height = MAX_DIM
        }
      }
      
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      
      const ctx = canvas.getContext("2d")
      if (!ctx) return resolve(file) // fallback
      
      ctx.drawImage(img, 0, 0, width, height)
      
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file)
          const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
            type: "image/jpeg",
            lastModified: Date.now(),
          })
          resolve(newFile)
        },
        "image/jpeg",
        0.8
      )
    }
    
    img.onerror = () => reject(new Error("Failed to load image for compression"))
    img.src = objectUrl
  })
}

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
    const savedData = sessionStorage.getItem("ocr_data")
    const savedPreview = sessionStorage.getItem("ocr_preview")
    const savedReviewed = sessionStorage.getItem("ocr_reviewed")
    
    if (savedData) setData(JSON.parse(savedData))
    if (savedReviewed) setReviewed(savedReviewed === "true")
    if (savedPreview) {
      setPreviewUrl(savedPreview)
      // Reconstruct file from base64
      try {
        const arr = savedPreview.split(',')
        const mime = arr[0].match(/:(.*?);/)![1]
        const bstr = atob(arr[1])
        let n = bstr.length
        const u8arr = new Uint8Array(n)
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n)
        }
        setFile(new File([u8arr], "restored_image.jpg", { type: mime }))
      } catch (e) {
        console.error("Failed to restore file from session storage")
      }
    }
    
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current)
    }
  }, [])

  // Sync data to session storage
  useEffect(() => {
    if (data) sessionStorage.setItem("ocr_data", JSON.stringify(data))
    else sessionStorage.removeItem("ocr_data")
  }, [data])

  useEffect(() => {
    sessionStorage.setItem("ocr_reviewed", reviewed ? "true" : "false")
  }, [reviewed])

  async function pickFile(f: File | undefined | null) {
    if (!f) return
    setError(null)
    setValidationError(null)
    if (!VALID_TYPES.includes(f.type)) {
      setValidationError("Unsupported file type. Use JPG, PNG, or WEBP.")
      return
    }
    
    try {
      const optimizedFile = await compressImage(f)
      setFile(optimizedFile)
      
      // Convert to base64 for preview and session storage persistence
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64data = reader.result as string
        setPreviewUrl(base64data)
        sessionStorage.setItem("ocr_preview", base64data)
      }
      reader.readAsDataURL(optimizedFile)
      
      setData(null)
      setReviewed(false)
    } catch (err) {
      setValidationError("Failed to optimize image.")
    }
  }

  function clearFile() {
    setFile(null)
    setPreviewUrl(null)
    setData(null)
    setReviewed(false)
    setError(null)
    sessionStorage.removeItem("ocr_data")
    sessionStorage.removeItem("ocr_preview")
    sessionStorage.removeItem("ocr_reviewed")
  }

  const [retryCountdown, setRetryCountdown] = useState<number | null>(null)
  const [isRateLimited, setIsRateLimited] = useState(false)

  useEffect(() => {
    if (retryCountdown === null) return
    if (retryCountdown <= 0) {
      setRetryCountdown(null)
      setIsRateLimited(false)
      if (file) void extract()
      return
    }
    const t = setTimeout(() => setRetryCountdown((c) => (c ? c - 1 : null)), 1000)
    return () => clearTimeout(t)
  }, [retryCountdown, file])

  async function extract() {
    if (!file || extracting) return
    setExtracting(true)
    setError(null)
    setIsRateLimited(false)
    setRetryCountdown(null)
    setProgress(8)

    // Simulate a determinate progress bar
    progressTimer.current = setInterval(() => {
      setProgress((p) => (p < 88 ? p + (88 - p) * 0.12 + 1 : p))
    }, 250)

    const runExtraction = async (fileToExtract: File, retryCount = 0): Promise<DocumentExtractResponse> => {
      try {
        return await api.extractDocument(fileToExtract)
      } catch (err: any) {
        const errMsg = String(err?.message || err?.detail || err || "").toLowerCase()
        const is429 = errMsg.includes("429") || errMsg.includes("rate") || errMsg.includes("limit") || errMsg.includes("too many")
        
        if (is429 && retryCount < 2) {
          setIsRateLimited(true)
          setRetryCountdown(5)
          throw new Error("OCR service is experiencing high demand. Automatic retry scheduled.")
        }
        if (retryCount < 1) {
          await new Promise(resolve => setTimeout(resolve, 2000))
          return runExtraction(fileToExtract, retryCount + 1)
        }
        throw err
      }
    }

    try {
      const res = await runExtraction(file)
      setProgress(100)
      setData(res)
      setReviewed(false)
      setIsRateLimited(false)
      setRetryCountdown(null)
    } catch (err) {
      setError(err)
    } finally {
      if (progressTimer.current) clearInterval(progressTimer.current)
      setTimeout(() => setExtracting(false), 300)
    }
  }

  function updateField(fieldId: string | number, value: string) {
    setData((prev) => {
      if (!prev) return prev
      if (typeof fieldId === "number") {
        if (!prev.extracted_fields) return prev
        const newFields = [...prev.extracted_fields]
        newFields[fieldId] = { ...newFields[fieldId], value, confidence: "High" }
        return { ...prev, extracted_fields: newFields }
      } else {
        return { ...prev, [fieldId]: value }
      }
    })
  }

  const [approving, setApproving] = useState(false)

  async function approve() {
    if (!data?.document_id || reviewed) return
    setApproving(true)
    setError(null)
    try {
      const res = await api.approveDocument(data.document_id, data)
      setReviewed(true)
    } catch (err) {
      setError(err)
    } finally {
      setApproving(false)
    }
  }

  return (
    <div>
      <PageHeading
        icon={<ScanSearch className="h-5 w-5" />}
        title={<span className="text-gradient-brand">Document Intelligence &amp; Verification</span>}
        description="Institutional document pipeline: automated classification, entity validation against ERP registries, and cross-module operational action routing."
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
        <OcrReviewForm 
          data={data} 
          reviewed={reviewed} 
          onFieldChange={updateField} 
          onApprove={approve}
          approving={approving} 
        />
      </div>

      {validationError && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-2.5">
          <p className="text-sm text-destructive">{validationError}</p>
        </div>
      )}

      {isRateLimited && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-amber-500">
              Uploaded document is securely stored &amp; safe.
            </p>
            <p className="text-xs text-muted-foreground">
              Vision OCR is rate-limited. Automatic retry in {retryCountdown ?? 5}s…
            </p>
          </div>
          <button
            type="button"
            onClick={() => extract()}
            disabled={extracting}
            className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-500/30 dark:text-amber-400"
          >
            Retry Extraction Now
          </button>
        </div>
      )}

      <AnimatePresence>
        {error && !isRateLimited ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 rounded-xl glass-surface">
            <ErrorState error={error} onRetry={extract} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
