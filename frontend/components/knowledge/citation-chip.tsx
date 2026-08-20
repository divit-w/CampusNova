"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FileText, X } from "lucide-react"
import type { RAGCitation } from "@/lib/types"
import { easeOutSoft } from "@/lib/motion"
import { cn } from "@/lib/utils"

function confidenceTone(score: number) {
  if (score >= 0.75) return "border-success/25 bg-success/[0.08] text-success"
  if (score >= 0.5) return "border-warning/30 bg-warning/[0.1] text-[hsl(30_60%_30%)]"
  return "border-destructive/25 bg-destructive/[0.08] text-destructive"
}

/**
 * Interactive reference chip — shows which indexed chunk backed part of the
 * RAG answer. Click to expand the exact extracted text + confidence inline.
 */
export function CitationChip({ citation, index }: { citation: RAGCitation; index: number }) {
  const [open, setOpen] = useState(false)
  const pct = Math.round(citation.confidence_score * 100)

  return (
    <div className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
          open ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-primary",
        )}
      >
        <FileText className="h-3 w-3 shrink-0" />
        Source {index + 1}
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", confidenceTone(citation.confidence_score))}>
          {pct}%
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={easeOutSoft}
            className="overflow-hidden"
          >
            <div className="relative max-w-sm rounded-xl border border-border bg-secondary/60 p-3 pr-8 text-xs leading-relaxed text-foreground">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close citation"
                className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
              <p className="text-pretty text-muted-foreground">&ldquo;{citation.extracted_text}&rdquo;</p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground/80">
                <span className="truncate">Doc {citation.document_id.slice(0, 8)} · Chunk {citation.chunk_index}</span>
                <span className={cn("shrink-0 font-semibold", confidenceTone(citation.confidence_score).split(" ").pop())}>
                  {pct}% match
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
