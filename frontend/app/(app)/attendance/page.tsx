"use client"

import { PageHeading } from "@/components/states"
import { AttendanceKpiCards } from "@/components/attendance-kpi-cards"
import { VisionUploadZone } from "@/components/attendance/vision-upload-zone"
import { FacultyClockIn } from "@/components/attendance/faculty-clock-in"
import { RosterStatusList } from "@/components/attendance/roster-status-list"
import { useAuth } from "@/lib/auth"

export default function AttendancePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"

  return (
    <div>
      <PageHeading
        title={<span className="text-gradient-brand">Attendance</span>}
        description="Mark faculty and student attendance with Vision OCR bulk sheets or a geofenced clock-in, then track daily coverage at a glance."
      />

      {isAdmin && (
        <div className="mb-6">
          <AttendanceKpiCards />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <VisionUploadZone />
        <FacultyClockIn />
      </div>

      {isAdmin && (
        <div className="mt-6">
          <RosterStatusList />
        </div>
      )}
    </div>
  )
}
