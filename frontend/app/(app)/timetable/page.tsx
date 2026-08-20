"use client"

import { useState } from "react"
import useSWR from "swr"
import { motion, AnimatePresence } from "framer-motion"
import { CalendarRange, Sparkles, Play, FileJson, RotateCcw } from "lucide-react"

import { api } from "@/lib/api"
import type { TimetablePayload, TimetableStatusResponse } from "@/lib/types"
import { SAMPLE_TIMETABLE_PAYLOAD } from "@/lib/sample-timetable"
import { spring } from "@/lib/motion"
import { PageHeading, ErrorState, EmptyState } from "@/components/states"
import { SolverProgress } from "@/components/solver-progress"
import { TimetableGrid } from "@/components/timetable-grid"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"

export default function TimetablePage() {
  const [draft, setDraft] = useState<string>(() => JSON.stringify(SAMPLE_TIMETABLE_PAYLOAD, null, 2))
  const [jsonError, setJsonError] = useState<string | null>(null)
  // The payload we actually submitted — used for id->name lookups in the grid.
  const [submitted, setSubmitted] = useState<TimetablePayload | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<unknown>(null)

  // Poll job status. Audit P0-2: interval is 1000ms ONLY while "processing",
  // and 0 (stopped) on any terminal state — no infinite polling loop.
  const { data: job, error: pollError } = useSWR<TimetableStatusResponse>(
    jobId ? `/timetable/status/${jobId}` : null,
    (path: string) => api.get<TimetableStatusResponse>(path),
    {
      refreshInterval: (latest) => (latest?.status === "processing" ? 1000 : 0),
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  )

  function loadSample() {
    setDraft(JSON.stringify(SAMPLE_TIMETABLE_PAYLOAD, null, 2))
    setJsonError(null)
  }

  function reset() {
    setJobId(null)
    setSubmitted(null)
    setSubmitError(null)
  }

  async function generate() {
    setSubmitError(null)
    let parsed: TimetablePayload
    try {
      parsed = JSON.parse(draft)
      setJsonError(null)
    } catch {
      setJsonError("Invalid JSON — check for a trailing comma or missing bracket.")
      return
    }
    try {
      reset()
      const res = await api.post<{ job_id: string; status: string }>("/timetable/generate", parsed)
      setSubmitted(parsed)
      setJobId(res.job_id)
    } catch (err) {
      setSubmitError(err)
    }
  }

  const status = job?.status
  const isProcessing = !!jobId && (status === "processing" || (!status && !pollError))
  const isDone = status === "completed" || status === "failed"
  const result = job?.result ?? null

  return (
    <div className="space-y-6">
      <PageHeading
        icon={<CalendarRange className="h-5 w-5" />}
        title="Timetable Workspace"
        description="Define your constraints, then let the CP-SAT solver build a conflict-free schedule. Results explain how well the constraints were satisfied."
        actions={
          submitted ? (
            <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
              <RotateCcw className="h-4 w-4" />
              New run
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* Constraint input */}
        <Card className="flex h-fit flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileJson className="h-4 w-4 text-primary" />
              Constraints
            </div>
            <Button variant="ghost" size="sm" onClick={loadSample} className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Load sample
            </Button>
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            rows={20}
            className="resize-none font-mono text-xs leading-relaxed"
            aria-label="Timetable constraints JSON"
          />
          {jsonError && <p className="mt-2 text-xs text-destructive">{jsonError}</p>}
          <Button onClick={generate} disabled={isProcessing} className="mt-3 gap-1.5">
            <Play className="h-4 w-4" />
            {isProcessing ? "Solving…" : "Generate timetable"}
          </Button>
        </Card>

        {/* Output */}
        <Card className="min-h-[420px] p-4">
          <AnimatePresence mode="wait">
            {submitError ? (
              <motion.div key="submit-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ErrorState error={submitError} onRetry={generate} />
              </motion.div>
            ) : pollError ? (
              <motion.div key="poll-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ErrorState error={pollError} onRetry={generate} />
              </motion.div>
            ) : !jobId ? (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <EmptyState
                  icon={CalendarRange}
                  title="No timetable yet"
                  description="Load the sample or paste your own constraints, then generate to see the schedule grid here."
                />
              </motion.div>
            ) : isProcessing && submitted ? (
              <motion.div key="solving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <SolverProgress payload={submitted} done={false} />
              </motion.div>
            ) : isDone && status === "failed" ? (
              <motion.div key="failed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <EmptyState
                  icon={CalendarRange}
                  title="Solver failed"
                  description={job?.error ?? "The solver could not complete this run."}
                />
              </motion.div>
            ) : result && submitted ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={spring.gentle}
              >
                <TimetableGrid result={result} payload={submitted} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Card>
      </div>
    </div>
  )
}
