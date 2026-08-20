"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, BellRing, CalendarRange, Radio, Repeat2, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { EmptyState, PageHeading } from "@/components/states"
import { AttendanceKpiCards } from "@/components/attendance-kpi-cards"
import { useAlerts } from "@/lib/alerts"
import { useAuth } from "@/lib/auth"
import { riseItem, staggerContainer } from "@/lib/motion"

const ACTIONS = [
  {
    href: "/assistant",
    icon: Sparkles,
    title: "AI Command",
    body: "Query students, teachers and classes in plain language.",
  },
  {
    href: "/timetable",
    icon: CalendarRange,
    title: "Generate Timetable",
    body: "Solve a conflict-free schedule from your constraints.",
  },
  {
    href: "/substitute",
    icon: Repeat2,
    title: "Resolve Substitute",
    body: "Assign ranked cover for an absent teacher instantly.",
  },
]

function relativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { status, feed } = useAlerts()
  const firstName = user?.full_name?.split(" ")[0] ?? "there"

  return (
    <div>
      <PageHeading
        title={`Good to see you, ${firstName}.`}
        description="Your campus operations at a glance. Jump into a workflow or keep an eye on the live alert stream."
      />

      {user?.role === "admin" && (
        <div className="mb-6">
          <AttendanceKpiCards />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
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
                    <p className="font-semibold tracking-tight">{a.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* Alert Center — live stream + session history */}
        <Card className="flex flex-col overflow-hidden">
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

          <div className="max-h-[360px] flex-1 overflow-y-auto">
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
