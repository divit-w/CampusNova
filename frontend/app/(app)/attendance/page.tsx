"use client"

import { Suspense, useState, useEffect } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { PageHeading } from "@/components/states"
import { AttendanceKpiCards } from "@/components/attendance-kpi-cards"
import { StudentSessionAttendance } from "@/components/attendance/student-session-attendance"
import { VisionUploadZone } from "@/components/attendance/vision-upload-zone"
import { FacultyClockIn } from "@/components/attendance/faculty-clock-in"
import { FacultyAttendanceList } from "@/components/attendance/faculty-attendance-list"
import { RosterStatusList, AttendanceFilter } from "@/components/attendance/roster-status-list"
import { useAuth } from "@/lib/auth"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { GraduationCap, UserCheck, FileScan, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

type WorkflowTab = "student" | "faculty" | "ocr"

function AttendanceContent() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"
  
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const rawTab = searchParams.get("tab") as WorkflowTab | null
  const [activeTab, setActiveTab] = useState<WorkflowTab>(rawTab && ["student", "faculty", "ocr"].includes(rawTab) ? rawTab : "student")

  const rawFilter = searchParams.get("filter")
  const validFilters: AttendanceFilter[] = ["all", "present", "absent", "excused", "unmarked"]
  const initialFilter: AttendanceFilter = rawFilter && validFilters.includes(rawFilter as AttendanceFilter)
    ? (rawFilter as AttendanceFilter)
    : "all"

  const [filter, setFilter] = useState<AttendanceFilter>(initialFilter)
  const [globalDate, setGlobalDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (rawFilter && validFilters.includes(rawFilter as AttendanceFilter)) {
      setFilter(rawFilter as AttendanceFilter)
    } else if (!rawFilter) {
      setFilter("all")
    }
  }, [rawFilter])

  function handleTabChange(tab: WorkflowTab) {
    setActiveTab(tab)
    const params = new URLSearchParams(searchParams.toString())
    if (tab === "student") {
      params.delete("tab")
    } else {
      params.set("tab", tab)
    }
    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }

  function handleFilterChange(newFilter: AttendanceFilter) {
    setFilter(newFilter)
    const params = new URLSearchParams(searchParams.toString())
    if (newFilter === "all") {
      params.delete("filter")
    } else {
      params.set("filter", newFilter)
    }
    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }

  function triggerRefresh() {
    setRefreshKey((prev) => prev + 1)
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeading
          title={<span className="text-gradient-brand">Attendance & Check-In</span>}
          description="Manage timetable-driven student class rosters, geofenced faculty clock-ins with biometric proof, and AI Vision OCR registers."
        />
        {isAdmin && (
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Operational Date:</span>
            <Input 
              type="date" 
              className="w-auto h-9 text-xs" 
              value={globalDate} 
              onChange={(e) => setGlobalDate(e.target.value)} 
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={triggerRefresh}
              title="Refresh attendance records"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* KPI Cards Row */}
      {isAdmin && (
        <AttendanceKpiCards 
          key={`kpis-${globalDate}-${refreshKey}`}
          date={globalDate} 
          activeFilter={filter}
          onSelectFilter={(f) => handleFilterChange(f as AttendanceFilter)}
        />
      )}

      {/* Workflow Navigation Segmented Control */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => handleTabChange("student")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all",
            activeTab === "student"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <GraduationCap className="h-4 w-4" />
          <span>Student Class Attendance</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("faculty")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all",
            activeTab === "faculty"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <UserCheck className="h-4 w-4" />
          <span>Faculty Attendance & Check-In</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("ocr")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all",
            activeTab === "ocr"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <FileScan className="h-4 w-4" />
          <span>Document & OCR Register</span>
        </button>
      </div>

      {/* Tab 1: Student Class Attendance */}
      {activeTab === "student" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <StudentSessionAttendance
              key={`student-session-${globalDate}-${refreshKey}`}
              selectedDate={globalDate}
              onDateChange={setGlobalDate}
              onAttendanceSaved={triggerRefresh}
            />
          </div>
          <div className="lg:col-span-1">
            <RosterStatusList 
              key={`roster-status-${globalDate}-${refreshKey}`}
              date={globalDate} 
              filter={filter}
              onFilterChange={handleFilterChange}
            />
          </div>
        </div>
      )}

      {/* Tab 2: Faculty Attendance & Biometric Check-In */}
      {activeTab === "faculty" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <FacultyClockIn onClockInSuccess={triggerRefresh} />
          {isAdmin && (
            <FacultyAttendanceList 
              key={`faculty-list-${globalDate}-${refreshKey}`}
              date={globalDate} 
            />
          )}
        </div>
      )}

      {/* Tab 3: Document & Vision OCR Register */}
      {activeTab === "ocr" && (
        <div className="grid gap-6">
          <VisionUploadZone selectedDate={globalDate} />
        </div>
      )}
    </div>
  )
}

export default function AttendancePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading attendance…</div>}>
      <AttendanceContent />
    </Suspense>
  )
}

