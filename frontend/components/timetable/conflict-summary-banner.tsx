"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Clock,
  MapPin,
  Users,
  User,
  ShieldAlert,
  Play,
  Layers,
} from "lucide-react"
import type { DetectedConflict } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function getConflictIcon(type: string) {
  switch (type) {
    case "teacher_double_booking":
      return <User className="h-3.5 w-3.5 text-rose-500" />
    case "room_double_booking":
    case "capacity_exceeded":
      return <MapPin className="h-3.5 w-3.5 text-amber-500" />
    case "cohort_double_booking":
    case "cohort_blocked":
      return <Users className="h-3.5 w-3.5 text-indigo-500" />
    default:
      return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
  }
}

function getConflictBadgeLabel(type: string) {
  switch (type) {
    case "teacher_double_booking":
      return "Faculty Double-Booking"
    case "room_double_booking":
      return "Room Collision"
    case "cohort_double_booking":
      return "Cohort Collision"
    case "teacher_blocked":
      return "Faculty Blocked Slot"
    case "cohort_blocked":
      return "Cohort Blocked Slot"
    case "capacity_exceeded":
      return "Room Capacity Overflow"
    case "unqualified_teacher":
      return "Unqualified Faculty"
    default:
      return "Schedule Conflict"
  }
}

interface ConflictSummaryBannerProps {
  conflicts: DetectedConflict[]
  totalSessions?: number
  onResolveClick?: () => void
  isSolving?: boolean
}

export function ConflictSummaryBanner({
  conflicts,
  totalSessions = 48,
  onResolveClick,
  isSolving = false,
}: ConflictSummaryBannerProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  if (!conflicts || conflicts.length === 0) return null

  return (
    <div className="w-full rounded-xl border border-destructive/40 bg-destructive/5 dark:bg-destructive/10 p-4 mb-4 shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/15 text-destructive">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-destructive bg-destructive/10 px-2 py-0.5 rounded-md border border-destructive/20">
                BEFORE — Conflicted Timetable
              </span>
              <Badge variant="destructive" className="text-[10px] px-2 py-0.5 font-semibold">
                {conflicts.length} Conflicts Detected
              </Badge>
              <Badge variant="neutral" className="text-[10px] px-2 py-0.5 gap-1">
                <Layers className="h-2.5 w-2.5" />
                {totalSessions} sessions
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Raw university timetable with overlapping resources, room double-bookings, and blocked-period violations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          {onResolveClick && (
            <Button
              size="sm"
              onClick={onResolveClick}
              disabled={isSolving}
              className="h-8 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm gap-1.5"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              {isSolving ? "Solving with CP-SAT..." : "Solve with CP-SAT"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <>
                Hide <ChevronUp className="h-3.5 w-3.5 ml-1" />
              </>
            ) : (
              <>
                {conflicts.length} Issues <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-destructive/20 space-y-2 max-h-56 overflow-y-auto pr-1">
              {conflicts.map((conflict, idx) => (
                <div
                  key={conflict.id || idx}
                  className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-background/90 px-3 py-2 text-xs shadow-none"
                >
                  <span className="mt-0.5 shrink-0">{getConflictIcon(conflict.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="font-semibold text-foreground">{conflict.title}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-destructive/40 text-destructive font-medium">
                        {getConflictBadgeLabel(conflict.type)}
                      </Badge>
                      <Badge variant="neutral" className="text-[10px] px-1.5 py-0 gap-1 text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {DAY_NAMES[conflict.day] || `Day ${conflict.day + 1}`} P{conflict.period + 1}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground leading-relaxed">
                      {conflict.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
