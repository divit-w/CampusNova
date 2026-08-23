import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { ScheduleEntry, TimetablePayload, TimetableResult } from "@/lib/types"

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

interface ExportTimetablePDFOptions {
  payload: TimetablePayload
  schedule: ScheduleEntry[]
  resultStatus?: string
  cohortFilter?: string
}

export function exportTimetablePDF({
  payload,
  schedule,
  resultStatus = "OPTIMAL",
  cohortFilter = "all",
}: ExportTimetablePDFOptions): void {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  })

  const teacherMap = Object.fromEntries(payload.teachers.map((t) => [t.id, t.name]))
  const subjectMap = Object.fromEntries(payload.subjects.map((s) => [s.id, s.name]))
  const cohortMap = Object.fromEntries(payload.cohorts.map((c) => [c.id, c.name]))

  const selectedCohortName =
    cohortFilter !== "all" ? (cohortMap[cohortFilter] ?? cohortFilter) : "All Cohorts"

  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 36

  // 1. Header Banner & Title
  doc.setFillColor(15, 23, 42) // Slate 900
  doc.rect(margin, 28, 4, 32, "F")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(15, 23, 42)
  doc.text("CampusNova Timetable", margin + 12, 44)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.text(
    `Cohort: ${selectedCohortName}  |  Status: ${resultStatus}  |  Exported: ${new Date().toLocaleDateString(undefined, { dateStyle: "medium" })}`,
    margin + 12,
    58,
  )

  // 2. Build Grid Data
  const days = Array.from({ length: payload.days_per_week }, (_, i) => i)
  const periods = Array.from({ length: payload.periods_per_day }, (_, i) => i)

  // Table Columns
  const head = [
    ["Period", ...days.map((d) => DAY_NAMES[d] ?? `Day ${d + 1}`)],
  ]

  // Map Schedule by day-period
  const cellMap = new Map<string, ScheduleEntry[]>()
  schedule.forEach((entry) => {
    if (cohortFilter !== "all" && entry.cohort_id !== cohortFilter) return
    const key = `${entry.day}-${entry.period}`
    const list = cellMap.get(key) ?? []
    list.push(entry)
    cellMap.set(key, list)
  })

  // Table Body Rows
  const body: string[][] = []

  periods.forEach((p) => {
    const row: string[] = [`P${p + 1}`]

    days.forEach((d) => {
      const entries = cellMap.get(`${d}-${p}`) ?? []
      if (entries.length === 0) {
        row.push("—")
      } else {
        const cellLines = entries.map((entry) => {
          if (entry.subject_id === "BLOCKED") {
            return `[BLOCKED]\n${cohortMap[entry.cohort_id] ?? entry.cohort_id}`
          }
          const subName = subjectMap[entry.subject_id] ?? entry.subject_id
          const tName = teacherMap[entry.teacher_id] ?? entry.teacher_id
          const rName = `Room ${entry.room_id}`
          const cName = cohortFilter === "all" ? `\n(${cohortMap[entry.cohort_id] ?? entry.cohort_id})` : ""
          return `${subName}\n${tName} · ${rName}${cName}`
        })
        row.push(cellLines.join("\n---\n"))
      }
    })

    body.push(row)
  })

  // 3. Render AutoTable
  autoTable(doc, {
    head,
    body,
    startY: 72,
    margin: { left: margin, right: margin, bottom: 40 },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 6,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.75,
      valign: "top",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
      minCellHeight: 24,
    },
    columnStyles: {
      0: {
        halign: "center",
        valign: "middle",
        fontStyle: "bold",
        fillColor: [248, 250, 252],
        cellWidth: 46,
      },
    },
    alternateRowStyles: {
      fillColor: [254, 254, 255],
    },
    didDrawPage: (data) => {
      // Footer
      const str = `CampusNova Intelligent Timetable Module  •  Page ${data.pageNumber}`
      doc.setFontSize(8)
      doc.setTextColor(148, 163, 184)
      doc.text(str, pageWidth / 2, doc.internal.pageSize.getHeight() - 16, { align: "center" })
    },
  })

  // 4. Save with clean filename
  const cleanName = selectedCohortName.replace(/[^a-zA-Z0-9_-]/g, "_")
  doc.save(`CampusNova_Timetable_${cleanName}.pdf`)
}
