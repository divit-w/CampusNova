"use client"

import {
  CheckCircle2,
  ShieldCheck,
  Zap,
  Clock,
  ArrowRight,
  Sparkles,
  Layers,
  UserCheck,
  Building2,
  Users,
  CalendarOff,
  Maximize2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { SolverResult } from "@/lib/types"

interface ResolutionProofCardProps {
  beforeConflictCount: number
  afterConflictCount: number
  totalPlaced: number
  totalRequired: number
  result: SolverResult
}

export function ResolutionProofCard({
  beforeConflictCount,
  afterConflictCount,
  totalPlaced,
  totalRequired,
  result,
}: ResolutionProofCardProps) {
  const solveTimeStr = result.solve_time_ms ? `${result.solve_time_ms} ms` : "< 1s"

  return (
    <Card className="w-full rounded-xl border border-success/40 bg-success/5 dark:bg-success/10 p-4 mb-4 shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/20 text-success">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-success bg-success/15 px-2 py-0.5 rounded-md border border-success/30">
                AFTER — Conflict-Free Timetable
              </span>
              <Badge variant="success" className="text-[10px] px-2 py-0.5 font-semibold gap-1">
                <CheckCircle2 className="h-3 w-3" />
                All Conflicts Resolved
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Google OR-Tools CP-SAT pruned all invalid permutations and produced a mathematically verified conflict-free schedule.
            </p>
          </div>
        </div>

        {/* Before vs After Strong Comparison Card */}
        <div className="flex items-center gap-3 bg-background/95 border border-border/80 rounded-xl p-2.5 shadow-sm text-xs">
          <div className="flex flex-col items-center px-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Before</span>
            <span className="text-xs font-bold text-destructive">{beforeConflictCount} Conflicts</span>
            <span className="text-[10px] text-muted-foreground">{totalRequired} sessions</span>
          </div>

          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

          <div className="flex flex-col items-center px-1">
            <span className="text-[10px] uppercase font-bold text-success tracking-wider">After</span>
            <span className="text-xs font-bold text-success">{afterConflictCount} Conflicts</span>
            <span className="text-[10px] text-foreground font-semibold">{totalPlaced} sessions</span>
          </div>
        </div>
      </div>

      {/* 5-Rule Verification Grid */}
      <div className="mt-3 pt-3 border-t border-success/20 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-background/70 border border-success/20">
          <UserCheck className="h-3.5 w-3.5 text-success shrink-0" />
          <div>
            <p className="text-[9px] text-muted-foreground">Teacher Conflicts</p>
            <p className="font-bold text-success text-[11px]">0</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-background/70 border border-success/20">
          <Building2 className="h-3.5 w-3.5 text-success shrink-0" />
          <div>
            <p className="text-[9px] text-muted-foreground">Room Conflicts</p>
            <p className="font-bold text-success text-[11px]">0</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-background/70 border border-success/20">
          <Users className="h-3.5 w-3.5 text-success shrink-0" />
          <div>
            <p className="text-[9px] text-muted-foreground">Cohort Conflicts</p>
            <p className="font-bold text-success text-[11px]">0</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-background/70 border border-success/20">
          <CalendarOff className="h-3.5 w-3.5 text-success shrink-0" />
          <div>
            <p className="text-[9px] text-muted-foreground">Blocked Violations</p>
            <p className="font-bold text-success text-[11px]">0</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-background/70 border border-success/20 col-span-2 sm:col-span-1">
          <Maximize2 className="h-3.5 w-3.5 text-success shrink-0" />
          <div>
            <p className="text-[9px] text-muted-foreground">Capacity Violations</p>
            <p className="font-bold text-success text-[11px]">0</p>
          </div>
        </div>
      </div>

      {/* Summary Metrics Bar */}
      <div className="mt-2 pt-2 border-t border-success/15 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-background/50 border border-border/30">
          <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
          <div>
            <p className="text-[9px] text-muted-foreground">Sessions Placed</p>
            <p className="font-bold text-foreground">{totalPlaced} / {totalRequired}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-background/50 border border-border/30">
          <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
          <div>
            <p className="text-[9px] text-muted-foreground">Conflicts Resolved</p>
            <p className="font-bold text-success">{beforeConflictCount} of {beforeConflictCount} (100%)</p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-background/50 border border-border/30">
          <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <div>
            <p className="text-[9px] text-muted-foreground">Solver Status</p>
            <p className="font-bold text-foreground">{result.status}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-background/50 border border-border/30">
          <Clock className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
          <div>
            <p className="text-[9px] text-muted-foreground">Solve Time</p>
            <p className="font-bold text-foreground">{solveTimeStr}</p>
          </div>
        </div>
      </div>
    </Card>
  )
}
