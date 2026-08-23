import type { TimetablePayload } from "@/lib/types"

/** Canonical feasible university timetable configuration for the Real Builder mode. */
export const SAMPLE_TIMETABLE_PAYLOAD: TimetablePayload = {
  days_per_week: 5,
  periods_per_day: 6,
  teachers: [
    { id: "F01", name: "Dr. Sharma", max_hours: 18, blocked_slots: [] },
    { id: "F02", name: "Dr. Verma", max_hours: 18, blocked_slots: [] },
    { id: "F03", name: "Prof. Gupta", max_hours: 18, blocked_slots: [] },
    { id: "F04", name: "Dr. Mukherjee", max_hours: 16, blocked_slots: [] },
    { id: "F05", name: "Prof. Saxena", max_hours: 18, blocked_slots: [] },
    { id: "F08", name: "Prof. Nair", max_hours: 16, blocked_slots: [] },
    { id: "F14", name: "Prof. Sen", max_hours: 16, blocked_slots: [] },
  ],
  rooms: [
    { id: "R101", name: "LH-101", capacity: 60, room_type: "lecture" },
    { id: "R102", name: "LH-102", capacity: 60, room_type: "lecture" },
    { id: "TR201", name: "TR-201", capacity: 55, room_type: "seminar" },
    { id: "LAB1", name: "Computing Lab", capacity: 60, room_type: "lab" },
  ],
  cohorts: [
    { id: "CSE-A", name: "CSE 3rd Year - Sec A", student_count: 52, blocked_slots: [] },
    { id: "CSE-B", name: "CSE 3rd Year - Sec B", student_count: 50, blocked_slots: [] },
    { id: "ECE-A", name: "ECE 3rd Year - Sec A", student_count: 45, blocked_slots: [] },
  ],
  subjects: [
    { id: "SUB-CS101", name: "Data Structures", room_type: "lecture" },
    { id: "SUB-CS102", name: "Operating Systems", room_type: "lecture" },
    { id: "SUB-CS103", name: "Database Systems", room_type: "lecture" },
    { id: "SUB-CS104", name: "Computer Networks", room_type: "lecture" },
    { id: "SUB-BS101", name: "Discrete Mathematics", room_type: "lecture" },
    { id: "SUB-EC101", name: "Digital Electronics", room_type: "lecture" },
  ],
  course_offerings: [
    { id: "OFF_CSEA_CS101", cohort_id: "CSE-A", subject_id: "SUB-CS101", required_weekly_hours: 3, qualified_teacher_ids: ["F01", "F03"] },
    { id: "OFF_CSEA_CS102", cohort_id: "CSE-A", subject_id: "SUB-CS102", required_weekly_hours: 3, qualified_teacher_ids: ["F03", "F04"] },
    { id: "OFF_CSEA_CS103", cohort_id: "CSE-A", subject_id: "SUB-CS103", required_weekly_hours: 3, qualified_teacher_ids: ["F02"] },
    { id: "OFF_CSEA_BS101", cohort_id: "CSE-A", subject_id: "SUB-BS101", required_weekly_hours: 2, qualified_teacher_ids: ["F05"] },
    { id: "OFF_CSEB_CS101", cohort_id: "CSE-B", subject_id: "SUB-CS101", required_weekly_hours: 3, qualified_teacher_ids: ["F01", "F03"] },
    { id: "OFF_CSEB_CS103", cohort_id: "CSE-B", subject_id: "SUB-CS103", required_weekly_hours: 3, qualified_teacher_ids: ["F02"] },
    { id: "OFF_ECEA_EC101", cohort_id: "ECE-A", subject_id: "SUB-EC101", required_weekly_hours: 3, qualified_teacher_ids: ["F08", "F14"] },
    { id: "OFF_ECEA_BS101", cohort_id: "ECE-A", subject_id: "SUB-BS101", required_weekly_hours: 3, qualified_teacher_ids: ["F05"] },
  ],
  hard_constraints: ["no_double_booking", "max_hours_respected", "qualified_faculty_only", "room_capacity_respected", "blocked_slots_respected"],
  fixed_slots: [],
  weight_faculty_gaps: 1.0,
  weight_subject_spread: 2.0,
}

