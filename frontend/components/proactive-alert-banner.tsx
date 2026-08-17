"use client"

import type React from "react"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, CalendarX2, ShieldAlert, X } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { DashboardSummaryResponse } from "@/lib/types"

interface Bottleneck {
  id: string
  severity: "critical" | "warning" | "info"
  icon: React.ElementType
  title: string
  body: string
  cta?: { label: string; href: string }
}

function deriveBottlenecks(summary: DashboardSummaryResponse | undefined): Bottleneck[] {
  if (!summary) return []
  const alerts: Bottleneck[] = []

  // Timetable failed
  if (summary.timetable_status === "failed") {
    alerts.push({
      id: "timetable-failed",
      severity: "critical",
      icon: CalendarX2,
      title: "Timetable generation failed",
      body: "The last solver run returned an error. Review constraints and retry.",
      cta: { label: "Go to Timetable", href: "/timetable" },
    })
  }

  // High substitution count
  if (summary.substitutions_today >= 3) {
    alerts.push({
      id: "high-subs",
      severity: "warning",
      icon: ShieldAlert,
      title: `${summary.substitutions_today} substitutes assigned today`,
      body: "Unusually high absence load. Verify coverage for remaining periods.",
      cta: { label: "Manage Substitutes", href: "/substitute" },
    })
  }

  // Low attendance
  const today = summary.weekly_attendance?.at(-1)
  if (today && today.total > 0) {
    const rate = today.present / today.total
    if (rate < 0.75) {
      alerts.push({
        id: "low-attendance",
        severity: today.present / today.total < 0.6 ? "critical" : "warning",
        icon: AlertTriangle,
        title: `Attendance at ${Math.round(rate * 100)}% today`,
        body: `${today.absent} students absent out of ${today.total}. Consider initiating parent notifications.`,
        cta: { label: "Review Attendance", href: "/attendance" },
      })
    }
  }

  return alerts
}

const SEVERITY_STYLES = {
  critical: {
    wrapper: "border-destructive/30 bg-destructive/6",
    icon: "bg-destructive/12 text-destructive",
    title: "text-destructive",
    body: "text-destructive/80",
    cta: "text-destructive hover:text-destructive/80 font-semibold",
    bar: "bg-destructive",
  },
  warning: {
    wrapper: "border-warning/40 bg-warning/6",
    icon: "bg-warning/15 text-warning",
    title: "text-warning-foreground",
    body: "text-muted-foreground",
    cta: "text-warning hover:text-warning/80 font-semibold",
    bar: "bg-warning",
  },
  info: {
    wrapper: "border-primary/20 bg-primary/4",
    icon: "bg-primary/10 text-primary",
    title: "text-foreground",
    body: "text-muted-foreground",
    cta: "text-primary hover:text-primary/80 font-semibold",
    bar: "bg-primary",
  },
}

function BannerCard({ bottleneck, onDismiss }: { bottleneck: Bottleneck; onDismiss: (id: string) => void }) {
  const s = SEVERITY_STYLES[bottleneck.severity]
  const Icon = bottleneck.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={cn(
        "relative flex items-start gap-3.5 overflow-hidden rounded-xl border px-4 py-3.5",
        s.wrapper,
      )}
      role="alert"
      aria-live="polite"
    >
      {/* left severity bar */}
      <span className={cn("absolute left-0 inset-y-0 w-0.5 rounded-l-xl", s.bar)} aria-hidden="true" />

      <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", s.icon)} aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold leading-snug", s.title)}>{bottleneck.title}</p>
        <p className={cn("mt-0.5 text-xs leading-relaxed", s.body)}>{bottleneck.body}</p>
        {bottleneck.cta && (
          <Link
            href={bottleneck.cta.href}
            className={cn("mt-1.5 inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline", s.cta)}
          >
            {bottleneck.cta.label} →
          </Link>
        )}
      </div>

      <button
        onClick={() => onDismiss(bottleneck.id)}
        className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-black/8 hover:text-foreground"
        aria-label="Dismiss alert"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}

export function ProactiveAlertBanner({ summary }: { summary: DashboardSummaryResponse | undefined }) {
  const bottlenecks = deriveBottlenecks(summary)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = bottlenecks.filter((b) => !dismissed.has(b.id))

  if (visible.length === 0) return null

  return (
    <motion.div layout className="mb-5 flex flex-col gap-2.5">
      <AnimatePresence mode="popLayout">
        {visible.map((b) => (
          <BannerCard
            key={b.id}
            bottleneck={b}
            onDismiss={(id) => setDismissed((prev) => new Set(Array.from(prev).concat(id)))}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  )
}
