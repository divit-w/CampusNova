"use client"

import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"

const dotTransition = (delay: number) => ({
  duration: 0.9,
  repeat: Number.POSITIVE_INFINITY,
  ease: [0.16, 1, 0.3, 1] as const,
  delay,
})

/** Animated "AI is thinking" bubble, shown while the RAG query is in flight. */
export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex w-full items-end gap-2.5"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-live text-primary-foreground">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 shadow-soft">
        {[0, 0.15, 0.3].map((delay, i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={dotTransition(delay)}
          />
        ))}
      </div>
    </motion.div>
  )
}
