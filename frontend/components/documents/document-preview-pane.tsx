"use client"

import { useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ImageIcon, RefreshCw, ScanSearch, UploadCloud, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentPreviewPane({
  file,
  previewUrl,
  dragging,
  onDragging,
  onPickFile,
  onClear,
  onExtract,
  extracting,
  progress,
}: {
  file: File | null
  previewUrl: string | null
  dragging: boolean
  onDragging: (v: boolean) => void
  onPickFile: (file: File | undefined | null) => void
  onClear: () => void
  onExtract: () => void
  extracting: boolean
  progress: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex h-full flex-col rounded-xl border border-border glass-surface p-4 shadow-soft sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <ImageIcon className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="text-sm font-semibold leading-tight">Document preview</p>
          <p className="text-xs text-muted-foreground">Upload a scan or photo to extract structured data</p>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!file) onDragging(true)
        }}
        onDragLeave={() => onDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          onDragging(false)
          onPickFile(e.dataTransfer.files?.[0])
        }}
        onClick={() => !file && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload document image"
        className={cn(
          "mt-4 flex flex-1 flex-col overflow-hidden rounded-xl border-2 border-dashed transition-all duration-300 ease-spring",
          file ? "border-transparent" : dragging ? "cursor-pointer border-primary bg-primary/5 scale-[1.01]" : "cursor-pointer border-border hover:border-primary/40 hover:bg-accent/40",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => onPickFile(e.target.files?.[0])}
        />

        <AnimatePresence mode="wait">
          {previewUrl ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative flex flex-1 flex-col"
            >
              <div className="relative flex-1 overflow-hidden rounded-xl bg-secondary/50">
                {/* Uploaded scan preview — object URL, not a static asset */}
                <img src={previewUrl} alt="Uploaded document preview" className="h-full w-full object-contain" crossOrigin="anonymous" />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{file?.name}</p>
                  <p className="text-[11px] text-muted-foreground">{file ? formatBytes(file.size) : null}</p>
                </div>
                <button
                  type="button"
                  onClick={onClear}
                  aria-label="Remove file"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center"
            >
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-secondary text-muted-foreground">
                <UploadCloud className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium">Drop a document image here</p>
              <p className="text-xs text-muted-foreground">or click to browse · JPG, PNG</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {extracting && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Running OCR extraction…</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary to-live"
                animate={{ width: `${progress}%` }}
                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4 flex gap-2">
        <Button onClick={onExtract} disabled={!file || extracting} className="flex-1 gap-1.5">
          <ScanSearch className="h-4 w-4" />
          {extracting ? "Extracting…" : "Run OCR extraction"}
        </Button>
        {file && (
          <Button variant="outline" size="icon" onClick={() => inputRef.current?.click()} disabled={extracting} aria-label="Replace file">
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
