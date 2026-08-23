"use client"

import Link from "next/link"
import { useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sparkles,
  CornerDownLeft,
  Loader2,
  Database,
  Zap,
  Download,
  ArrowRight,
  Compass,
  CheckCircle2,
  ShieldCheck,
  CalendarClock,
  UserX,
} from "lucide-react"

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
  "Show all students in CSE-A",
  "Show Dr. Sharma's classes today",
  "Find a substitute for Dr. Sharma",
  "Who is absent today?",
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
        title="AI Command Center"
        description="Ask in plain English. CampusNova intelligently translates your inquiry into operational actions and real ERP queries."
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
            placeholder="e.g. Show all students in CSE-A, Show Dr. Sharma's classes today, or Find a substitute for Dr. Sharma"
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
            key="idle"
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
            Interpreting your request and evaluating ERP operations…
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
                <Badge variant={view.data.intent === "action" ? "success" : "live"} className="gap-1.5 capitalize">
                  <Zap className="h-3.5 w-3.5" />
                  {view.data.intent ?? view.data.action_type}
                </Badge>
                {view.data.target_collection && view.data.target_collection !== "system" && (
                  <Badge variant="neutral" className="gap-1.5">
                    <Database className="h-3.5 w-3.5" />
                    {view.data.target_collection}
                  </Badge>
                )}
                
                {/* Verified Data Indicator */}
                {view.data.total_matches !== undefined && (
                  <Badge variant="outline" className="gap-1 text-xs border-success/30 bg-success/10 text-success">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified from CampusNova records
                  </Badge>
                )}

                <div className="ml-auto flex items-center gap-3">
                  {view.data.total_matches !== undefined && (
                    <span className="text-xs font-medium text-muted-foreground">
                      {view.data.total_matches} record{view.data.total_matches === 1 ? '' : 's'}
                      {view.data.preview_count !== undefined && view.data.total_matches > view.data.preview_count
                        ? ` (showing ${view.data.preview_count})`
                        : ''}
                    </span>
                  )}
                  
                  {(() => {
                    const hasData = Array.isArray(view.data.results) 
                    ? view.data.results.length > 0 
                    : (view.data.results && Object.keys(view.data.results).length > 0);
                  
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

            {/* Contextual Structured Action Card */}
            {view.data.action_card && (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Compass className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold text-foreground">{view.data.action_card.title}</h4>
                    </div>
                    {view.data.action_card.detail && (
                      <p className="text-xs text-muted-foreground">{view.data.action_card.detail}</p>
                    )}
                  </div>
                  <Button asChild size="sm" className="gap-1.5 shrink-0">
                    <Link href={view.data.action_card.route}>
                      <span>{view.data.action_card.action_label}</span>
                    </Link>
                  </Button>
                </div>
              </div>
            )}

            {/* AI Summary Response */}
            {view.data.summary && (
              <div className="rounded-xl bg-secondary/30 p-4 border border-border text-sm leading-relaxed text-foreground">
                <p className="font-medium text-primary mb-1 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4" /> Operational Summary:
                </p>
                {view.data.summary}
              </div>
            )}

            {/* Fallback Action Workflow banner if route is provided without full action_card */}
            {view.data.route && !view.data.action_card && (
              <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 p-4">
                <div className="flex items-center gap-2.5">
                  <Compass className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">Recommended Action Workflow</span>
                </div>
                <Button asChild size="sm" className="gap-1.5">
                  <Link href={view.data.route}>
                    {view.data.suggested_action ?? "Open Workflow"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )}

            {/* Verified Result Data Table */}
            {(() => {
              const hasData = Array.isArray(view.data.results)
                ? view.data.results.length > 0
                : (view.data.results && Object.keys(view.data.results).length > 0);

              if (!hasData) return null;
              return <ResultRenderer results={view.data.results} />;
            })()}
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
