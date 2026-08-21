"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { UserX, UserCheck, CalendarClock, Clock, Wand2, Radio } from "lucide-react"

import { api } from "@/lib/api"
import type { ResolveConflictResponse } from "@/lib/types"
import { spring } from "@/lib/motion"
import { PageHeading, ErrorState } from "@/components/states"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const TIME_SLOTS = ["P1", "P2", "P3", "P4", "P5", "P6"]

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function SubstitutePage() {
  const [absentTeacherId, setAbsentTeacherId] = useState("")
  const [date, setDate] = useState(todayIso())
  const [timeSlot, setTimeSlot] = useState("P1")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ResolveConflictResponse | null>(null)
  const [error, setError] = useState<unknown>(null)

  async function resolve(e: React.FormEvent) {
    e.preventDefault()
    if (!absentTeacherId.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.post<ResolveConflictResponse>("/resources/resolve-conflict", {
        absent_teacher_id: absentTeacherId.trim(),
        date,
        time_slot: timeSlot,
      })
      setResult(res)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeading
        icon={<UserX className="h-5 w-5" />}
        title={<span className="text-gradient-brand">Substitute Resolution</span>}
        description="Report an absent teacher and CampusNova's predictive allocator ranks and assigns the best available substitute — broadcasting a live alert to everyone connected."
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Trigger form */}
        <Card className="p-5">
          <form onSubmit={resolve} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="teacher">Absent teacher ID</Label>
              <div className="relative">
                <UserX
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="teacher"
                  value={absentTeacherId}
                  onChange={(e) => setAbsentTeacherId(e.target.value)}
                  placeholder="e.g. T1"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <div className="relative">
                <CalendarClock
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label id="time-slot-label">Time slot</Label>
              <div role="group" aria-labelledby="time-slot-label" className="flex flex-wrap gap-2">
                {TIME_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setTimeSlot(slot)}
                    aria-pressed={timeSlot === slot}
                    className={
                      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
                      (timeSlot === slot
                        ? "border-primary bg-gradient-to-r from-primary/15 to-live/10 text-primary shadow-glow-primary"
                        : "glass-surface text-muted-foreground hover:border-primary/40")
                    }
                  >
                    <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                    {slot}
                  </button>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !absentTeacherId.trim()}
              aria-busy={loading}
              className="w-full gap-1.5"
            >
              <Wand2 aria-hidden="true" className="h-4 w-4" />
              {loading ? "Finding substitute…" : "Resolve conflict"}
            </Button>
          </form>
        </Card>

        {/* Result */}
        <div className="flex flex-col">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-primary/25 bg-white/50 px-6 py-10 text-center text-sm text-muted-foreground backdrop-blur-2xl"
                role="status"
                aria-live="polite"
              >
                <span className="flex items-center gap-2">
                  <Radio aria-hidden="true" className="h-4 w-4 animate-pulse text-primary" />
                  Ranking available substitutes…
                </span>
              </motion.div>
            ) : error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1"
              >
                <Card className="flex h-full items-center p-2">
                  <ErrorState error={error} onRetry={() => resolve(new Event("submit") as unknown as React.FormEvent)} />
                </Card>
              </motion.div>
            ) : result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.97, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={spring.gentle}
                className="flex-1"
                role="status"
                aria-live="polite"
              >
                <Card className="flex h-full flex-col justify-center gap-4 border-resolved/30 bg-resolved/[0.04] p-6">
                  <div className="flex items-center gap-2">
                    <Badge variant="success" className="gap-1.5">
                      <UserCheck aria-hidden="true" className="h-3.5 w-3.5" />
                      Assigned
                    </Badge>
                    <Badge variant="live" className="gap-1.5">
                      <Radio aria-hidden="true" className="h-3.5 w-3.5" />
                      Broadcast live
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Selected substitute
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">
                      {result.substitute_teacher_id}
                    </p>
                  </div>
                  <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{result.message}</p>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/60 bg-white/40 px-6 py-10 text-center backdrop-blur-xl"
              >
                <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-xl bg-secondary text-muted-foreground">
                  <UserCheck className="h-5 w-5" />
                </span>
                <p className="max-w-xs text-pretty text-sm text-muted-foreground">
                  The ranked substitute will appear here, and a live alert will notify all connected users.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
