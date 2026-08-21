import type { TimetablePayload } from "@/lib/types"

/** A known-feasible sample payload so the workspace is demoable in one click. */
export const SAMPLE_TIMETABLE_PAYLOAD: TimetablePayload = {
  days_per_week: 5,
  periods_per_day: 6,
  teachers: [
    { id: "T1", name: "Dr. Rao", max_hours: 20 },
    { id: "T2", name: "Ms. Iyer", max_hours: 20 },
    { id: "T3", name: "Mr. Khan", max_hours: 20 },
    { id: "T4", name: "Dr. Fernandes", max_hours: 20 },
  ],
  rooms: [
    { id: "R1", capacity: 40 },
    { id: "R2", capacity: 40 },
  ],
  subjects: [
    { id: "S1", name: "Mathematics", required_weekly_hours: 4, qualified_teachers: ["T1", "T2"] },
    { id: "S2", name: "Physics", required_weekly_hours: 3, qualified_teachers: ["T2"] },
    { id: "S3", name: "English", required_weekly_hours: 3, qualified_teachers: ["T3"] },
    { id: "S4", name: "History", required_weekly_hours: 2, qualified_teachers: ["T4"] },
  ],
  cohorts: [{ id: "C1", name: "Grade 9-A", student_count: 32 }],
  hard_constraints: ["no_double_booking", "max_hours_respected"],
  fixed_slots: [],
  weight_faculty_gaps: 1.0,
  weight_subject_spread: 2.0,
}
