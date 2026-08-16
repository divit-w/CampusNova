"use client"

import { useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, CornerDownLeft, Loader2, Database, Zap, Download } from "lucide-react"

import { api } from "@/lib/api"
import type { PromptResponse } from "@/lib/types"
import { spring } from "@/lib/motion"
import { PageHeading, ErrorState } from "@/components/states"
import { ResultRenderer } from "@/components/result-renderer"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

const EXAMPLE_PROMPTS = [
  "Show all teachers in the science department",
  "List every cohort with more than 30 students",
  "Which rooms are free during period 3?",
  "Count the total number of active students",
]

type ViewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: PromptResponse; query: string }
  | { kind: "error"; error: unknown }

export default function AssistantPage() {
  const [query, setQuery] = useState("")
  const [view, setView] = useState<ViewState>({ kind: "idle" })
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  async function runQuery(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed || view.kind === "loading") return
    setView({ kind: "loading" })
    try {
      const data = await api.prompt(trimmed)
      setView({ kind: "success", data, query: trimmed })
    } catch (err: any) {
      setView({ kind: "error", error: err })
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Respect IME composition (CJK) and Safari's unreliable final event.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      runQuery(query)
    }
  }

  function useExample(prompt: string) {
    setQuery(prompt)
    textareaRef.current?.focus()
    runQuery(prompt)
  }

  function handleExportCsv() {
    if (view.kind !== "success") return
    
    // Normalize to array
    const rawData = view.data.results
    const dataArray = Array.isArray(rawData) ? rawData : rawData ? [rawData] : []
    
    if (dataArray.length === 0) return
    
    // Extract headers
    const headers = Array.from(
      new Set(dataArray.flatMap((row) => Object.keys(row as Record<string, unknown>)))
    )
    
    // Build CSV content
    const csvRows = []
    // Add header row
    csvRows.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(","))
    
    // Add data rows
    for (const row of dataArray) {
      const values = headers.map((header) => {
        const val = (row as Record<string, unknown>)[header]
        // Handle null, undefined, objects
        const strVal = val === null || val === undefined 
          ? "" 
          : typeof val === "object"
            ? JSON.stringify(val)
            : String(val)
            
        return `"${strVal.replace(/"/g, '""')}"`
      })
      csvRows.push(values.join(","))
    }
    
    const csvContent = csvRows.join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", "campusnova_export.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeading
        icon={<Sparkles className="h-5 w-5" />}
        title="Command Center"
        description="Ask in plain English. CampusNova translates your request into a live query against the ERP."
      />

      {/* Composer */}
      <Card className="p-2">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder="e.g. Show all teachers in the science department"
            className="resize-none border-0 bg-transparent pr-28 text-base shadow-none focus-visible:ring-0"
            aria-label="Natural language query"
          />
          <div className="absolute bottom-2 right-2">
            <Button
              onClick={() => runQuery(query)}
              disabled={!query.trim() || view.kind === "loading"}
              className="gap-1.5"
            >
              {view.kind === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CornerDownLeft className="h-4 w-4" />
              )}
              Ask
            </Button>
          </div>
        </div>
      </Card>

      {/* Example prompts */}
      <AnimatePresence>
        {view.kind === "idle" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={spring.gentle}
            className="space-y-3"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Try one of these
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => useExample(prompt)}
                  className="group flex items-center gap-2.5 rounded-xl border border-border glass-surface px-4 py-3 text-left text-sm text-foreground transition-all duration-300 ease-spring hover:-translate-y-[1px] hover:scale-[1.01] hover:border-primary/40 hover:bg-white/80 hover:shadow-soft"
                >
                  <Zap className="h-4 w-4 shrink-0 text-primary/70 transition-transform group-hover:scale-110" />
                  <span className="text-pretty">{prompt}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result area */}
      <AnimatePresence mode="wait">
        {view.kind === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 rounded-xl border border-border glass-surface px-5 py-8 text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Interpreting your request and querying the ERP…
          </motion.div>
        )}

        {view.kind === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring.gentle}
          >
            <Card className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-4">
                <Badge variant="live" className="gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  {view.data.action_type}
                </Badge>
                <Badge variant="neutral" className="gap-1.5">
                  <Database className="h-3.5 w-3.5" />
                  {view.data.target_collection}
                </Badge>
                
                <div className="ml-auto flex items-center gap-3">
                  <span className="hidden max-w-[200px] truncate text-xs text-muted-foreground sm:inline-block">
                    &ldquo;{view.query}&rdquo;
                  </span>
                  
                  {(() => {
                    const hasData = Array.isArray(view.data.results) 
                      ? view.data.results.length > 0 
                      : !!view.data.results;
                    
                    if (!hasData) return null;
                    
                    return (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 gap-1.5 text-xs"
                        onClick={handleExportCsv}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Export CSV
                      </Button>
                    );
                  })()}
                </div>
              </div>
              {view.data.summary && (
                <div className="rounded-md bg-primary/10 p-4 border border-primary/20 text-sm text-primary">
                  <strong>AI Summary:</strong> {view.data.summary}
                </div>
              )}
              <ResultRenderer results={view.data.results} />
            </Card>
          </motion.div>
        )}

        {view.kind === "error" && (
          <motion.div
            key="err"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring.gentle}
          >
            <Card className="p-2">
              <ErrorState error={view.error} onRetry={() => runQuery(query)} />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
