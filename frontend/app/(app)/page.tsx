"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, BellRing, CalendarRange, Radio, ShieldCheck, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { EmptyState, PageHeading } from "@/components/states"
import { AttendanceKpiCards } from "@/components/attendance-kpi-cards"
import { TransportKpiCard } from "@/components/transport-kpi-card"
import { OperationsSummaryCards } from "@/components/operations-summary-cards"
import { AttendanceTrendChart } from "@/components/attendance-trend-chart"
import { useAlerts } from "@/lib/alerts"
import { useAuth } from "@/lib/auth"
import { relativeTime, relativeTimeFromIso } from "@/lib/format"
import { riseItem, staggerContainer } from "@/lib/motion"
import { useDashboardSummary } from "@/lib/use-dashboard-summary"

export default function DashboardPage() {
  const { user } = useAuth()
  const { status, feed } = useAlerts()
  const isAdmin = user?.role === "admin"
  const { data: summary } = useDashboardSummary(isAdmin)
  const firstName = user?.full_name?.split(" ")[0] ?? "there"

  const timetableAgo = relativeTimeFromIso(summary?.timetable_generated_at)
  const timetableStatusText =
    summary?.timetable_status === "processing"
      ? "Generating now…"
      : timetableAgo
        ? `Last generated ${timetableAgo}`
        : "Not generated yet"

  const substitutionsText =
    summary && summary.substitutions_today > 0
      ? `${summary.substitutions_today} assigned today`
      : "None assigned today"

  const ACTIONS = [
    {
      href: "/assistant",
      icon: Sparkles,
      title: "AI Command",
      body: "Query students, teachers and classes in plain language.",
      status: null as string | null,
    },
    {
      href: "/timetable",
      icon: CalendarRange,
      title: "Generate Timetable",
      body: "Solve a conflict-free schedule from your constraints.",
      status: isAdmin ? timetableStatusText : null,
    },
    {
      href: "/substitute",
      icon: ShieldCheck,
      title: "Resolve Substitute",
      body: "Assign ranked cover for an absent teacher instantly.",
      status: isAdmin ? substitutionsText : null,
    },
  ]

  return (
    <div>
      <PageHeading
        title={`Good to see you, ${firstName}.`}
        description="Your campus operations at a glance. Jump into a workflow or keep an eye on the live alert stream."
      />

      {isAdmin && (
        <div className="mb-6 flex flex-col gap-4">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-3">
              <AttendanceKpiCards />
            </div>
            <TransportKpiCard />
          </motion.div>
          <OperationsSummaryCards />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-6">
          {isAdmin && <AttendanceTrendChart />}

          {/* Quick actions */}
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2">
            {ACTIONS.map((a) => (
              <motion.div key={a.href} variants={riseItem} className={a.href === "/assistant" ? "sm:col-span-2" : ""}>
                <Link href={a.href} className="group block h-full">
                  <Card className="flex h-full flex-col justify-between p-5 transition-all duration-300 ease-spring hover:-translate-y-0.5 hover:shadow-soft-lg">
                    <div className="flex items-start justify-between">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                        <a.icon className="h-5 w-5" />
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary" />
                    </div>
                    <div className="mt-6">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold tracking-tight">{a.title}</p>
                        {a.status && (
                          <span className="shrink-0 text-xs font-medium text-muted-foreground">{a.status}</span>
                        )}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
                    </div>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Alert Center — live stream + session history */}
        <Card className="flex flex-col overflow-hidden lg:sticky lg:top-6 lg:self-start">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-live/10 text-live">
                <Radio className="h-[18px] w-[18px]" />
              </span>
              <div>
                <p className="text-sm font-semibold leading-tight">Alert Center</p>
                <p className="text-xs text-muted-foreground">Live stream &amp; recent history</p>
              </div>
            </div>
            <Badge variant={status === "connected" ? "live" : "warning"}>
              {status === "connected" ? "Connected" : status === "reconnecting" ? "Reconnecting" : "Connecting"}
            </Badge>
          </div>

          <div className="max-h-[420px] flex-1 overflow-y-auto lg:max-h-[560px]">
            {feed.length === 0 ? (
              <EmptyState
                icon={BellRing}
                title="No alerts yet"
                description="Substitute assignments and system events will appear here in real time."
              />
            ) : (
              <motion.ul variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-1 p-3">
                {feed.map((item) => (
                  <motion.li
                    key={item.id}
                    variants={riseItem}
                    className="flex gap-3 rounded-xl p-3 transition-colors hover:bg-accent"
                  >
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-live" />
                    <div className="min-w-0">
                      <p className="text-pretty text-sm leading-snug">{item.message}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{relativeTime(item.receivedAt)}</p>
                    </div>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
