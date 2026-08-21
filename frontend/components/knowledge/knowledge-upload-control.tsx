"use client"

import { useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, CheckCircle2, Loader2, UploadCloud } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ApiError, api } from "@/lib/api"
import { easeOutSoft } from "@/lib/motion"

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "success"; message: string } | { kind: "error"; message: string }

/** Compact "Add document" control that ingests a PDF into ChromaDB via /knowledge/upload. */
export function KnowledgeUploadControl() {
  const [status, setStatus] = useState<Status>({ kind: "idle" })
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File | undefined | null) {
    if (!file) return
    if (file.type !== "application/pdf") {
      setStatus({ kind: "error", message: "Only PDF files can be indexed." })
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setStatus({ kind: "error", message: "File exceeds the 15MB limit." })
      return
    }
    setStatus({ kind: "loading" })
    try {
      const res = await api.uploadKnowledgeDocument(file)
      setStatus({ kind: "success", message: `Indexed "${file.name}" · ${res.total_chunks} chunks` })
    } catch (err) {
      const message = err instanceof ApiError && err.status === 409 ? "This document is already indexed." : err instanceof Error ? err.message : "Upload failed"
      setStatus({ kind: "error", message })
    } finally {
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <input ref={inputRef} type="file" accept="application/pdf" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={status.kind === "loading"} className="gap-1.5">
        {status.kind === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
        Add document
      </Button>
      <AnimatePresence>
        {(status.kind === "success" || status.kind === "error") && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={easeOutSoft}
            className={
              status.kind === "success"
                ? "flex items-center gap-1 text-xs text-success"
                : "flex items-center gap-1 text-xs text-destructive"
            }
          >
            {status.kind === "success" ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <AlertTriangle className="h-3 w-3 shrink-0" />}
            <span className="max-w-[220px] truncate">{status.message}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
