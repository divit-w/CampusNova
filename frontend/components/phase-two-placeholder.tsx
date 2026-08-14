"use client"

import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PageHeading } from "@/components/states"
import { spring } from "@/lib/motion"

/** Shared shell for modules scheduled for Phase 2 — keeps routing/nav complete. */
export function PhaseTwoPlaceholder({
  title,
  description,
  icon: Icon,
  bullets,
}: {
  title: string
  description: string
  icon: LucideIcon
  bullets: string[]
}) {
  return (
    <div>
      <PageHeading title={title} description={description} />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <Card className="relative overflow-hidden p-8 sm:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/5 blur-2xl"
          />
          <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="h-7 w-7" />
            </span>
            <div>
              <Badge variant="neutral" className="mb-3">
                Coming in Phase 2
              </Badge>
              <h3 className="text-xl font-semibold tracking-tight text-balance">{title} is on the roadmap</h3>
              <p className="mt-2 max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground">
                This module is planned for the next phase. The navigation and routing are ready — the
                workflow itself will land here soon.
              </p>
            </div>
          </div>

          <div className="relative mt-8 grid gap-3 sm:grid-cols-3">
            {bullets.map((b) => (
              <div key={b} className="rounded-xl border border-dashed border-border bg-surface/60 p-4">
                <p className="text-sm text-muted-foreground">{b}</p>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>
    </div>
  )
}
