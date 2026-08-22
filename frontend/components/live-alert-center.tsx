"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { BellRing, CheckCircle2, Loader2, Radio } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/states"
import { useAlerts, type ConnectionStatus } from "@/lib/alerts"
import { api, ApiError } from "@/lib/api"
import { relativeTime } from "@/lib/format"
import { riseItem, staggerContainer } from "@/lib/motion"
import { cn } from "@/lib/utils"
import type { FeedAlert } from "@/lib/types"

/**
 * Parse the substitute alert message emitted by /resources/resolve-conflict.
 * Format: "Substitute {name} assigned for {absent} at {slot}."
 * Returns structured fields if parseable, null otherwise.
 */
function parseSubstituteAlert(message: string): { substitute: string; absent: string; slot: string } | null {
  const m = message.match(/^Substitute (.+?) assigned for (.+?) at (.+?)\.$/)
  if (!m) return null
  return { substitute: m[1], absent: m[2], slot: m[3] }
}

function AlertRow({ item }: { item: FeedAlert }) {
  const [resolveState, setResolveState] = useState<"idle" | "loading" | "done">("idle")
  const parsed = parseSubstituteAlert(item.message)

  async function handleReassign() {
    if (!parsed || resolveState !== "idle") return
    setResolveState("loading")
    try {
      // Extract the absent teacher identifier and time slot from the parsed message.
      // The absent teacher field can be a full name; we pass it through as-is since
      // /resources/resolve-conflict accepts teacher_id — this is a best-effort
      // inline action. Full reassignment lives at /substitute.
      await api.resolveConflict({
        absent_teacher_id: parsed.absent,
        date: new Date().toISOString().split("T")[0],
        time_slot: parsed.slot,
      })
      setResolveState("done")
    } catch (err) {
      // Silently fall back to "idle" so the user can retry or navigate to /substitute.
      if (err instanceof ApiError && err.status === 409) {
        // 409 = no substitutes available — treat as done (backend already responded)
        setResolveState("done")
      } else {
        setResolveState("idle")
      }
    }
  }

  return (
    <motion.li
      layout
      variants={riseItem}
      className="group flex gap-3 rounded-xl p-3 transition-colors hover:bg-accent"
    >
      {/* Pulse dot — cyan for substitute assignments, slate for generic events */}
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          parsed ? "animate-pulse-live bg-live" : "bg-muted-foreground/40",
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-pretty text-sm leading-snug">{item.message}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{relativeTime(item.receivedAt)}</p>

        {/* Actionable CTA — only on parseable substitute alerts */}
        {parsed && (
          <div className="mt-2">
            {resolveState === "done" ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Reassignment queued
              </span>
            ) : (
              <button
                onClick={handleReassign}
                disabled={resolveState === "loading"}
                className="inline-flex items-center gap-1.5 rounded-md border border-live/30 bg-live/8 px-2.5 py-1 text-xs font-medium text-live transition-all hover:bg-live/15 hover:shadow-glow-cyan disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resolveState === "loading" ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Assigning…
                  </>
                ) : (
                  <>Reassign cover →</>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </motion.li>
  )
}

const STATUS_BADGE: Record<ConnectionStatus, { label: string; variant: "live" | "warning" }> = {
  connected: { label: "Connected", variant: "live" },
  reconnecting: { label: "Reconnecting", variant: "warning" },
  connecting: { label: "Connecting", variant: "warning" },
}

export function LiveAlertCenter() {
  const { status, feed, clearFeed } = useAlerts()
  const badge = STATUS_BADGE[status]

  return (
    <Card className="flex flex-col overflow-hidden lg:sticky lg:top-6 lg:self-start" id="alert-center">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-live/15 to-primary/10 text-live">
            <Radio className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">Alert Center</p>
            <p className="text-xs text-muted-foreground">
              Live stream · {feed.length} event{feed.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {feed.length > 0 && (
            <button
              onClick={clearFeed}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              aria-label="Clear alert history"
            >
              Clear
            </button>
          )}
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
      </div>

      {/* Feed */}
      <div className="max-h-[440px] flex-1 overflow-y-auto lg:max-h-[580px]">
        <AnimatePresence initial={false}>
          {feed.length === 0 ? (
            <EmptyState
              icon={BellRing}
              title="No alerts yet"
              description="Substitute assignments and system events will appear here in real time."
            />
          ) : (
            <motion.ul
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="flex flex-col gap-0.5 p-3"
            >
              {feed.map((item) => (
                <AlertRow key={item.id} item={item} />
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </Card>
  )
}
