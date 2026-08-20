"use client"

import { MessagesSquare } from "lucide-react"
import { PhaseTwoPlaceholder } from "@/components/phase-two-placeholder"

export default function AttendancePage() {
  return (
    <PhaseTwoPlaceholder
      title="Attendance"
      description="Mark, track and analyze daily student and faculty attendance."
      icon={MessagesSquare}
      bullets={["Daily roster marking", "Per-cohort summaries", "Absence anomaly flags"]}
    />
  )
}
