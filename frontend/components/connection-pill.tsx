"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useAlerts } from "@/lib/alerts"
import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * Fixed bottom-left live-connection indicator (audit P2-8).
 * Cyan = connected, amber = connecting/reconnecting. Present on every
 * authenticated screen via the app-group layout.
 */
export function ConnectionPill() {
  const { status } = useAlerts()
  const connected = status === "connected"

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50">
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring}
        className={cn(
          "glass pointer-events-auto flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-pill transition-colors duration-300",
          connected ? "border-live/25 shadow-glow-cyan" : "border-warning/25",
        )}
      >
        <span className="relative flex h-2.5 w-2.5">
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-70",
              connected ? "bg-live animate-pulse-live" : "bg-warning animate-pulse-live",
            )}
          />
          <span
            className={cn(
              "relative inline-flex h-2.5 w-2.5 rounded-full",
              connected ? "bg-live" : "bg-warning",
            )}
          />
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={status}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="text-xs font-medium text-foreground"
          >
            {connected ? "Live · Connected" : status === "reconnecting" ? "Reconnecting…" : "Connecting…"}
          </motion.span>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
