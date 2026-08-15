"use client"

import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { AlertTriangle, Ban, Clock, Inbox, ServerCrash, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { easeOutSoft } from "@/lib/motion"
import { cn } from "@/lib/utils"

export function PageHeading({
  icon,
  title,
  description,
  actions,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeOutSoft}
      className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
    >
      <div className="flex items-start gap-3">
        {icon && (
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/15 to-live/15 text-primary"
          >
            {icon}
          </span>
        )}
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-balance">{title}</h2>
          {description && <p className="mt-1.5 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </motion.div>
  )
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-xl bg-secondary text-muted-foreground">
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="mt-1 max-w-sm text-pretty text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  )
}

/**
 * Maps an ApiError to a friendly, status-specific panel.
 * Handles the audit-required 403 / 429 / 502 states plus network + generic.
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  let icon: LucideIcon = AlertTriangle
  let title = "Something went wrong"
  let description = "An unexpected error occurred. Please try again."

  if (error instanceof ApiError) {
    switch (error.status) {
      case 0:
        icon = WifiOff
        title = "Backend unreachable"
        description = error.detail
        break
      case 403:
        icon = Ban
        title = "Not enough permissions"
        description = "Your role doesn't have access to this action."
        break
      case 429:
        icon = Clock
        title = "You're going a little fast"
        description = "Rate limit reached (10 requests/minute). Give it a moment and try again."
        break
      case 502:
      case 503:
      case 504:
        icon = ServerCrash
        title = "AI service temporarily unavailable"
        description = "The AI provider didn't respond. This is usually transient — please retry shortly."
        break
      default:
        description = error.detail || description
    }
  }

  const Icon = icon
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center" role="alert">
      <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-xl bg-destructive/10 text-destructive">
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 max-w-sm text-pretty text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          Try again
        </Button>
      )}
    </div>
  )
}
