"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Cpu } from "lucide-react"
import type { TimetablePayload } from "@/lib/types"

/**
 * Determinate solver progress (audit P1-4).
 *
 * The CP-SAT solver has a 10s wall-clock cap. We animate a determinate bar
 * from 0 -> 90% across ~10s, then HOLD at 90% until the poll reports a terminal
 * state, at which point `done` drives it to 100%. This is intentionally not a
 * generic spinner — it communicates real expected duration and live params.
 */

const CAP = 90
const DURATION_MS = 10_000

export function SolverProgress({
  payload,
  done,
}: {
  payload: TimetablePayload
  done: boolean
}) {
  const [progress, setProgress] = useState(0)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (done) {
      setProgress(100)
      return
    }
    function tick(now: number) {
      if (startRef.current === null) startRef.current = now
      const elapsed = now - startRef.current
      // Ease toward the 90% cap; approach asymptotically so it never stalls abruptly.
      const linear = Math.min(elapsed / DURATION_MS, 1)
      const eased = 1 - Math.pow(1 - linear, 2)
      setProgress(Math.min(eased * CAP, CAP))
      if (linear < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [done])

  const stats = [
    `${payload.days_per_week} days`,
    `${payload.periods_per_day} periods`,
    `${payload.teachers.length} teachers`,
    `${payload.subjects.length} subjects`,
    `${payload.cohorts.length} cohorts`,
  ]

  return (
    <div className="flex flex-col items-center gap-5 px-6 py-12 text-center">
      <motion.span
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="grid h-14 w-14 place-items-center rounded-xl bg-primary/10 text-primary"
      >
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ repeat: Number.POSITIVE_INFINITY, duration: 3, ease: "linear" }}
        >
          <Cpu className="h-6 w-6" />
        </motion.span>
      </motion.span>

      <div>
        <p className="text-sm font-semibold">Solving the timetable…</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {"Solving for "}
          {stats.join(" \u00d7 ").replace(/ × (?=\d+ (teachers|subjects|cohorts))/g, ", ")}
        </p>
      </div>

      <div className="w-full max-w-sm">
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-live"
            animate={{ width: `${progress}%` }}
            transition={{ ease: "easeOut", duration: done ? 0.4 : 0.2 }}
          />
        </div>
        <p className="mt-2 text-xs tabular-nums text-muted-foreground">
          {progress >= CAP && !done
            ? "Finalizing constraints…"
            : `${Math.round(progress)}%`}
        </p>
      </div>
    </div>
  )
}
