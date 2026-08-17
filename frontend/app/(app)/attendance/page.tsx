"use client"

import { useState } from "react"
import { PageHeading } from "@/components/states"
import { AttendanceKpiCards } from "@/components/attendance-kpi-cards"
import { VisionUploadZone } from "@/components/attendance/vision-upload-zone"
import { FacultyClockIn } from "@/components/attendance/faculty-clock-in"
import { RosterStatusList } from "@/components/attendance/roster-status-list"
import { useAuth } from "@/lib/auth"
import { Input } from "@/components/ui/input"

export default function AttendancePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"
  
  const [globalDate, setGlobalDate] = useState(() => new Date().toISOString().slice(0, 10))

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeading
          title={<span className="text-gradient-brand">Attendance</span>}
          description="Mark faculty and student attendance with Vision OCR bulk sheets or a geofenced clock-in, then track daily coverage at a glance."
        />
        {isAdmin && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Select Date:</span>
            <Input 
              type="date" 
              className="w-auto h-9" 
              value={globalDate} 
              onChange={(e) => setGlobalDate(e.target.value)} 
            />
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="mb-6 mt-4">
          <AttendanceKpiCards date={globalDate} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <VisionUploadZone />
        <FacultyClockIn />
      </div>

      {isAdmin && (
        <div className="mt-6">
          <RosterStatusList date={globalDate} />
        </div>
      )}
    </div>
  )
}
