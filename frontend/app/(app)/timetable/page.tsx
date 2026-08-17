"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import useSWR from "swr"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle,
  CalendarRange,
  
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react"
import { ConstraintBuilder } from "@/components/timetable/constraint-builder"
import { AlgorithmExplainer } from "@/components/timetable/algorithm-explainer"


import { api } from "@/lib/api"
import type { TimetablePayload, TimetableStatusResponse } from "@/lib/types"
import { SAMPLE_TIMETABLE_PAYLOAD } from "@/lib/sample-timetable"
import { spring } from "@/lib/motion"
import { PageHeading, ErrorState, EmptyState } from "@/components/states"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

// Both are only ever rendered after a solve is triggered, so they're split out
// of the initial bundle. SolverProgress owns its own rAF animation loop and
// TimetableGrid does non-trivial memoized grid computation — neither is
// needed for the idle/empty state most visits start on.
const SolverProgress = dynamic(
  () => import("@/components/solver-progress").then((m) => m.SolverProgress),
  { loading: () => <Skeleton className="h-64 w-full rounded-xl" /> },
)
const TimetableGrid = dynamic(
  () => import("@/components/timetable-grid").then((m) => m.TimetableGrid),
  { loading: () => <Skeleton className="h-64 w-full rounded-xl" /> },
)

// Skeleton matrix has been replaced by the AlgorithmExplainer

/**
 * Actionable remediation advice shown when the CP-SAT solver returns INFEASIBLE
 * or MODEL_INVALID. Replaces the generic "Solver failed" empty state with
 * concrete steps the admin can take to resolve the constraint conflict.
 */
function InfeasibilityGuidanceCard({ errorDetail }: { errorDetail: string }) {
  return (
    <div className="flex flex-col gap-4 px-4 py-8">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-500">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">
            Constraint Conflict Detected
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Solver status: {errorDetail}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 text-sm">
        <p className="font-medium text-foreground">Remediation steps:</p>
        <ul className="mt-2 space-y-1.5 text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-amber-500">→</span>
            <span>
              <strong className="text-foreground">Relax fixed faculty slots</strong> — remove
              or reduce{" "}
              <code className="rounded bg-secondary px-1 text-xs">fixed_slots</code>{" "}
              entries that pin a specific teacher to a specific period.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-amber-500">→</span>
            <span>
              <strong className="text-foreground">Allocate additional rooms</strong> — add
              more room entries if multiple cohorts need the same period simultaneously.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-amber-500">→</span>
            <span>
              <strong className="text-foreground">Reduce required weekly hours</strong> —
              lower{" "}
              <code className="rounded bg-secondary px-1 text-xs">required_weekly_hours</code>{" "}
              for any subject that exceeds available period slots.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-amber-500">→</span>
            <span>
              <strong className="text-foreground">Increase scheduling window</strong> — raise{" "}
              <code className="rounded bg-secondary px-1 text-xs">days_per_week</code> or{" "}
              <code className="rounded bg-secondary px-1 text-xs">periods_per_day</code> to
              give the solver more space.
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}

export default function TimetablePage() {
  const [draft, setDraft] = useState<TimetablePayload>(SAMPLE_TIMETABLE_PAYLOAD)
  const [jsonError, setJsonError] = useState<string | null>(null)
  // The payload we actually submitted — used for id-to-name lookups in the grid.
  const [submitted, setSubmitted] = useState<TimetablePayload | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<unknown>(null)

  // Poll job status with SWR resilience flags:
  //   shouldRetryOnError: true  — transient network blips don't permanently kill the loop.
  //   errorRetryInterval: 1500  — 1.5 s between retry attempts on error.
  //   errorRetryCount: 5        — surface a persistent error only after 5 consecutive failures.
  //   refreshInterval: dynamic  — 1000 ms while "processing", 0 (stopped) on terminal states.
  const { data: job, error: pollError } = useSWR<TimetableStatusResponse>(
    jobId ? `/timetable/status/${jobId}` : null,
    (path: string) => api.get<TimetableStatusResponse>(path),
    {
      refreshInterval: (latest) => (latest?.status === "processing" ? 1000 : 0),
      revalidateOnFocus: false,
      shouldRetryOnError: true,
      errorRetryInterval: 1500,
      errorRetryCount: 5,
    },
  )

  function loadSample() {
    setDraft(SAMPLE_TIMETABLE_PAYLOAD)
    setJsonError(null)
  }

  function reset() {
    setJobId(null)
    setSubmitted(null)
    setSubmitError(null)
  }

  async function generate() {
    setSubmitError(null)
    const parsed = draft
    setJsonError(null)
    try {
      reset()
      const res = await api.optimizeTimetable(parsed)
      setSubmitted(parsed)
      setJobId(res.job_id)
    } catch (err) {
      setSubmitError(err)
    }
  }

  const status = job?.status
  const isProcessing =
    !!jobId && (status === "processing" || (!status && !pollError))
  const isDone = status === "completed" || status === "failed"
  const result = job?.result ?? null

  // Detect infeasibility: backend sets status="failed" and error contains
  // "INFEASIBLE" or "MODEL_INVALID" when the CP-SAT solver cannot find a solution.
  const isInfeasible =
    isDone &&
    status === "failed" &&
    ((job?.error?.includes("INFEASIBLE")) || (job?.error?.includes("MODEL_INVALID")))

  return (
    <div className="space-y-6">
      <PageHeading
        icon={<CalendarRange className="h-5 w-5" />}
        title={<span className="text-gradient-brand">Timetable Workspace</span>}
        description="Define your constraints, then let the CP-SAT solver build a conflict-free schedule. Results explain how well the constraints were satisfied."
        actions={
          submitted ? (
            <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              New run
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col lg:flex-row gap-6 w-full h-full items-start">
        {/* Constraint input */}
        <Card className="flex flex-col p-4 w-full lg:w-[45%] xl:w-[40%] shrink-0 h-[calc(100vh-12rem)] min-h-[600px] overflow-hidden">
          <div className="mb-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles aria-hidden="true" className="h-4 w-4 text-primary" />
              Constraints
            </div>
          </div>
          
          <div className="flex-1 min-h-0 flex flex-col">
            <ConstraintBuilder payload={draft} onChange={setDraft} />
          </div>
          
          <div className="shrink-0 pt-4 mt-auto border-t border-border/50">
            {jsonError && <p className="mb-2 text-xs text-destructive">{jsonError}</p>}
            <Button
              onClick={generate}
              disabled={isProcessing}
              aria-busy={isProcessing}
              className="w-full gap-1.5"
            >
              <Play aria-hidden="true" className="h-4 w-4" />
              {isProcessing ? "Solving…" : "Generate timetable"}
            </Button>
          </div>
        </Card>

        {/* Output */}
        <Card className="p-4 flex-1 min-w-0 overflow-x-auto flex flex-col h-[calc(100vh-12rem)] min-h-[600px]">
          <AnimatePresence mode="wait">
            {submitError ? (
              <motion.div
                key="submit-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <ErrorState error={submitError} onRetry={generate} />
              </motion.div>
            ) : pollError ? (
              <motion.div
                key="poll-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <ErrorState error={pollError} onRetry={generate} />
              </motion.div>
            ) : !jobId ? (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <EmptyState
                  icon={CalendarRange}
                  title="No timetable yet"
                  description="Load the sample or paste your own constraints, then generate to see the schedule grid here."
                />
              </motion.div>
            ) : isProcessing && submitted ? (
              <motion.div
                key="solving"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <AlgorithmExplainer />
              </motion.div>
            ) : isInfeasible ? (
              <motion.div
                key="infeasible"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={spring.gentle}
              >
                <InfeasibilityGuidanceCard errorDetail={job?.error ?? "INFEASIBLE"} />
              </motion.div>
            ) : isDone && status === "failed" ? (
              <motion.div
                key="failed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
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
                className="flex flex-col flex-1 min-w-0 w-full"
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

