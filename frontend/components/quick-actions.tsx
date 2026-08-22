"use client"

import type React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowRight,
  CalendarRange,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { riseItem, staggerContainer } from "@/lib/motion"
import { cn } from "@/lib/utils"
import type { DashboardSummaryResponse } from "@/lib/types"

interface Action {
  href: string
  icon: React.ElementType
  title: string
  body: string
  status: string | null
  /**
   * When true the card gets a subtle amber urgency ring + warning icon,
   * signalling the admin should take action rather than just navigate.
   */
  urgent: boolean
  wide?: boolean
}

function deriveActions(summary: DashboardSummaryResponse | undefined, isAdmin: boolean): Action[] {
  const timetableAgo = (() => {
    if (!summary?.timetable_generated_at) return null
    const diff = Date.now() - new Date(summary.timetable_generated_at).getTime()
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor((diff % 3_600_000) / 60_000)
    if (h > 0) return `${h}h ${m}m ago`
    return `${m}m ago`
  })()

  const timetableStatus =
    summary?.timetable_status === "processing"
      ? "Generating now…"
      : summary?.timetable_status === "failed"
      ? "Last run failed — retry needed"
      : timetableAgo
      ? `Last generated ${timetableAgo}`
      : "Not generated yet"

  const timetableUrgent = summary?.timetable_status === "failed"

  const subsCount = summary?.substitutions_today ?? 0
  const subsStatus =
    subsCount > 0 ? `${subsCount} assigned today` : "None assigned today"
  const subsUrgent = subsCount >= 3

  return [
    {
      href: "/assistant",
      icon: Sparkles,
      title: "AI Command",
      body: "Query students, teachers and classes in plain language.",
      status: null,
      urgent: false,
      wide: true,
    },
    {
      href: "/timetable",
      icon: CalendarRange,
      title: "Generate Timetable",
      body: "Solve a conflict-free schedule from your constraints.",
      status: isAdmin ? timetableStatus : null,
      urgent: isAdmin && timetableUrgent,
    },
    {
      href: "/substitute",
      icon: ShieldCheck,
      title: "Resolve Substitute",
      body: "Assign ranked cover for an absent teacher instantly.",
      status: isAdmin ? subsStatus : null,
      urgent: isAdmin && subsUrgent,
    },
  ]
}

export function QuickActions({
  summary,
  isAdmin,
}: {
  summary: DashboardSummaryResponse | undefined
  isAdmin: boolean
}) {
  const actions = deriveActions(summary, isAdmin)

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid gap-4 sm:grid-cols-2"
    >
      {actions.map((a) => (
        <motion.div
          key={a.href}
          variants={riseItem}
          className={a.wide ? "sm:col-span-2" : ""}
        >
          <Link href={a.href} className="group block h-full">
            <Card
              className={cn(
                "relative flex h-full flex-col justify-between overflow-hidden p-5 transition-all duration-300 ease-spring hover:-translate-y-1 hover:scale-[1.02] hover:shadow-glow-primary",
                a.urgent &&
                  "ring-1 ring-warning/50 hover:ring-warning/70 hover:shadow-[0_10px_32px_-8px_hsl(var(--warning)/0.3),0_2px_8px_-2px_hsl(var(--warning)/0.15)]",
              )}
            >
              {/* Urgency strip */}
              {a.urgent && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-0.5 rounded-t-[inherit] bg-warning"
                />
              )}

              <div className="flex items-start justify-between">
                <span
                  className={cn(
                    "grid h-11 w-11 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110",
                    a.wide
                      ? "bg-gradient-to-br from-primary/15 to-live/15 text-primary"
                      : a.urgent
                      ? "bg-warning/12 text-warning"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  <a.icon className="h-5 w-5" />
                </span>

                <div className="flex items-center gap-1.5">
                  {a.urgent && (
                    <TriangleAlert
                      className="h-3.5 w-3.5 text-warning"
                      aria-label="Action required"
                    />
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary" />
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold tracking-tight">{a.title}</p>
                  {a.status && (
                    <span
                      className={cn(
                        "shrink-0 text-xs font-medium",
                        a.urgent ? "text-warning" : "text-muted-foreground",
                      )}
                    >
                      {a.status}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {a.body}
                </p>
              </div>
            </Card>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  )
}
