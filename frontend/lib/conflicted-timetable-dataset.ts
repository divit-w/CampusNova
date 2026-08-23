import type { TimetablePayload, ScheduleEntry } from "@/lib/types"

/**
 * Realistic multi-cohort conflicting baseline timetable dataset.
 * Simulates an unoptimized, problematic university schedule with 7 real-world conflicts:
 * 1. Teacher Double-Booking (Dr. Sharma teaching CSE-A and CSE-B simultaneously on Mon P1)
 * 2. Room Double-Booking (LH-101 booked for CSE-A and ECE-A simultaneously on Mon P2)
 * 3. Teacher Blocked Period Violation (Dr. Sharma assigned during HOD Meeting on Mon P1)
 * 4. Cohort Blocked Period Violation (CSE-A assigned during College Assembly on Tue P1)
 * 5. Room Capacity Violation (CSE-A with 55 students assigned to TR-201 with capacity 30 on Wed P3)
 * 6. Cohort Double-Booking (CSE-B assigned to DBMS and Math concurrently on Thu P2)
 * 7. Unqualified Faculty Assignment (Prof. Nair / Electronics assigned to teach Math on Fri P1)
 *
 * This dataset is 100% solvable by the CP-SAT engine once optimized!
 */

export const CONFLICTED_TIMETABLE_PAYLOAD: TimetablePayload = {
  days_per_week: 5,
  periods_per_day: 6,
  teachers: [
    {
      id: "F01",
      name: "Dr. Sharma",
      max_hours: 14,
      blocked_slots: [{ day: 0, period: 0 }], // Blocked Monday P1: Department HOD Meeting
    },
    { id: "F02", name: "Dr. Verma", max_hours: 14, blocked_slots: [] },
    { id: "F03", name: "Prof. Gupta", max_hours: 14, blocked_slots: [] },
    { id: "F04", name: "Dr. Mukherjee", max_hours: 12, blocked_slots: [] },
    { id: "F05", name: "Prof. Saxena", max_hours: 16, blocked_slots: [] },
    { id: "F08", name: "Prof. Nair", max_hours: 14, blocked_slots: [] },
    { id: "F14", name: "Prof. Sen", max_hours: 12, blocked_slots: [] },
  ],
  rooms: [
    { id: "R101", name: "LH-101", capacity: 60, room_type: "lecture" },
    { id: "R102", name: "LH-102", capacity: 60, room_type: "lecture" },
    { id: "TR201", name: "TR-201", capacity: 30, room_type: "seminar" }, // Undersized for 50+ cohorts
    { id: "LAB1", name: "Computing Lab", capacity: 60, room_type: "lab" },
  ],
  cohorts: [
    {
      id: "CSE-A",
      name: "CSE 3rd Year - Sec A",
      student_count: 55,
      blocked_slots: [{ day: 1, period: 0 }], // Blocked Tuesday P1: Weekly College Assembly
    },
    {
      id: "CSE-B",
      name: "CSE 3rd Year - Sec B",
      student_count: 52,
      blocked_slots: [{ day: 2, period: 0 }], // Blocked Wednesday P1: Sports & Activity
    },
    {
      id: "ECE-A",
      name: "ECE 3rd Year - Sec A",
      student_count: 45,
      blocked_slots: [],
    },
  ],
  subjects: [
    { id: "SUB-CS101", name: "Data Structures", room_type: "lab" },
    { id: "SUB-CS102", name: "Operating Systems", room_type: "lecture" },
    { id: "SUB-CS103", name: "Database Systems", room_type: "lecture" },
    { id: "SUB-CS104", name: "Computer Networks", room_type: "lecture" },
    { id: "SUB-EC101", name: "Digital Electronics", room_type: "lecture" },
    { id: "SUB-BS101", name: "Discrete Mathematics", room_type: "lecture" },
    { id: "SUB-HS101", name: "Technical Communication", room_type: "lecture" },
  ],
  course_offerings: [
    // ── CSE-A (18 hrs) ──
    { id: "OFF_CSEA_DS", cohort_id: "CSE-A", subject_id: "SUB-CS101", required_weekly_hours: 4, qualified_teacher_ids: ["F01", "F03"], allowed_room_ids: ["LAB1", "R101", "R102"] },
    { id: "OFF_CSEA_OS", cohort_id: "CSE-A", subject_id: "SUB-CS102", required_weekly_hours: 3, qualified_teacher_ids: ["F03"], allowed_room_ids: ["R101", "R102"] },
    { id: "OFF_CSEA_DBMS", cohort_id: "CSE-A", subject_id: "SUB-CS103", required_weekly_hours: 3, qualified_teacher_ids: ["F02"], allowed_room_ids: ["R101", "R102"] },
    { id: "OFF_CSEA_CN", cohort_id: "CSE-A", subject_id: "SUB-CS104", required_weekly_hours: 3, qualified_teacher_ids: ["F04"], allowed_room_ids: ["R101", "R102"] },
    { id: "OFF_CSEA_DM", cohort_id: "CSE-A", subject_id: "SUB-BS101", required_weekly_hours: 3, qualified_teacher_ids: ["F05"], allowed_room_ids: ["R101", "R102"] },
    { id: "OFF_CSEA_TC", cohort_id: "CSE-A", subject_id: "SUB-HS101", required_weekly_hours: 2, qualified_teacher_ids: ["F14"], allowed_room_ids: ["R101", "R102"] },

    // ── CSE-B (18 hrs) ──
    { id: "OFF_CSEB_DS", cohort_id: "CSE-B", subject_id: "SUB-CS101", required_weekly_hours: 4, qualified_teacher_ids: ["F01", "F03"], allowed_room_ids: ["LAB1", "R101", "R102"] },
    { id: "OFF_CSEB_OS", cohort_id: "CSE-B", subject_id: "SUB-CS102", required_weekly_hours: 3, qualified_teacher_ids: ["F03"], allowed_room_ids: ["R101", "R102"] },
    { id: "OFF_CSEB_DBMS", cohort_id: "CSE-B", subject_id: "SUB-CS103", required_weekly_hours: 3, qualified_teacher_ids: ["F02"], allowed_room_ids: ["R101", "R102"] },
    { id: "OFF_CSEB_CN", cohort_id: "CSE-B", subject_id: "SUB-CS104", required_weekly_hours: 3, qualified_teacher_ids: ["F04"], allowed_room_ids: ["R101", "R102"] },
    { id: "OFF_CSEB_DM", cohort_id: "CSE-B", subject_id: "SUB-BS101", required_weekly_hours: 3, qualified_teacher_ids: ["F05"], allowed_room_ids: ["R101", "R102"] },
    { id: "OFF_CSEB_TC", cohort_id: "CSE-B", subject_id: "SUB-HS101", required_weekly_hours: 2, qualified_teacher_ids: ["F14"], allowed_room_ids: ["R101", "R102"] },

    // ── ECE-A (12 hrs) ──
    { id: "OFF_ECEA_DE", cohort_id: "ECE-A", subject_id: "SUB-EC101", required_weekly_hours: 4, qualified_teacher_ids: ["F08"], allowed_room_ids: ["R101", "R102", "TR201"] },
    { id: "OFF_ECEA_DM", cohort_id: "ECE-A", subject_id: "SUB-BS101", required_weekly_hours: 3, qualified_teacher_ids: ["F05"], allowed_room_ids: ["R101", "R102", "TR201"] },
    { id: "OFF_ECEA_CN", cohort_id: "ECE-A", subject_id: "SUB-CS104", required_weekly_hours: 3, qualified_teacher_ids: ["F04"], allowed_room_ids: ["R101", "R102", "TR201"] },
    { id: "OFF_ECEA_TC", cohort_id: "ECE-A", subject_id: "SUB-HS101", required_weekly_hours: 2, qualified_teacher_ids: ["F14"], allowed_room_ids: ["R101", "R102", "TR201"] },
  ],
  hard_constraints: ["no_double_booking", "max_hours_respected", "qualified_faculty_only"],
  fixed_slots: [],
  weight_faculty_gaps: 1.0,
  weight_subject_spread: 2.0,
}

/**
 * Deliberately conflicted unoptimized baseline schedule (The "BEFORE" state).
 * Contains 7 distinct scheduling collisions clearly traceable by the conflict detector.
 */
export const CONFLICTED_RAW_SCHEDULE: ScheduleEntry[] = [
  // ── Monday ──
  // Conflict 1 & 3: Dr. Sharma double-booked AND teaching during blocked HOD meeting (Mon P1)
  { offering_id: "OFF_CSEA_DS", cohort_id: "CSE-A", subject_id: "SUB-CS101", teacher_id: "F01", room_id: "R101", day: 0, period: 0 },
  { offering_id: "OFF_CSEB_DS", cohort_id: "CSE-B", subject_id: "SUB-CS101", teacher_id: "F01", room_id: "R102", day: 0, period: 0 },

  // Conflict 2: Room R101 double-booked for CSE-A OS and ECE-A DE (Mon P2)
  { offering_id: "OFF_CSEA_OS", cohort_id: "CSE-A", subject_id: "SUB-CS102", teacher_id: "F03", room_id: "R101", day: 0, period: 1 },
  { offering_id: "OFF_ECEA_DE", cohort_id: "ECE-A", subject_id: "SUB-EC101", teacher_id: "F08", room_id: "R101", day: 0, period: 1 },

  { offering_id: "OFF_CSEB_DBMS", cohort_id: "CSE-B", subject_id: "SUB-CS103", teacher_id: "F02", room_id: "R102", day: 0, period: 2 },
  { offering_id: "OFF_CSEA_CN", cohort_id: "CSE-A", subject_id: "SUB-CS104", teacher_id: "F04", room_id: "R101", day: 0, period: 3 },

  // ── Tuesday ──
  // Conflict 4: CSE-A assigned during blocked College Assembly (Tue P1)
  { offering_id: "OFF_CSEA_DM", cohort_id: "CSE-A", subject_id: "SUB-BS101", teacher_id: "F05", room_id: "R101", day: 1, period: 0 },

  { offering_id: "OFF_CSEB_OS", cohort_id: "CSE-B", subject_id: "SUB-CS102", teacher_id: "F03", room_id: "R102", day: 1, period: 1 },
  { offering_id: "OFF_ECEA_DM", cohort_id: "ECE-A", subject_id: "SUB-BS101", teacher_id: "F05", room_id: "R101", day: 1, period: 2 },
  { offering_id: "OFF_CSEA_DS", cohort_id: "CSE-A", subject_id: "SUB-CS101", teacher_id: "F01", room_id: "LAB1", day: 1, period: 3 },

  // ── Wednesday ──
  { offering_id: "OFF_CSEB_CN", cohort_id: "CSE-B", subject_id: "SUB-CS104", teacher_id: "F04", room_id: "R102", day: 2, period: 1 },
  // Conflict 5: CSE-A (55 students) assigned to undersized TR201 (cap 30) (Wed P3)
  { offering_id: "OFF_CSEA_DBMS", cohort_id: "CSE-A", subject_id: "SUB-CS103", teacher_id: "F02", room_id: "TR201", day: 2, period: 2 },
  { offering_id: "OFF_ECEA_CN", cohort_id: "ECE-A", subject_id: "SUB-CS104", teacher_id: "F04", room_id: "R101", day: 2, period: 3 },

  // ── Thursday ──
  // Conflict 6: Cohort CSE-B double-booked with DBMS and Math concurrently (Thu P2)
  { offering_id: "OFF_CSEB_DBMS", cohort_id: "CSE-B", subject_id: "SUB-CS103", teacher_id: "F02", room_id: "R102", day: 3, period: 1 },
  { offering_id: "OFF_CSEB_DM", cohort_id: "CSE-B", subject_id: "SUB-BS101", teacher_id: "F05", room_id: "R101", day: 3, period: 1 },
  { offering_id: "OFF_CSEA_OS", cohort_id: "CSE-A", subject_id: "SUB-CS102", teacher_id: "F03", room_id: "R101", day: 3, period: 2 },

  // ── Friday ──
  // Conflict 7: Unqualified teacher Prof. Nair (Electronics) assigned to CSE-A Mathematics (Fri P1)
  { offering_id: "OFF_CSEA_DM", cohort_id: "CSE-A", subject_id: "SUB-BS101", teacher_id: "F08", room_id: "R101", day: 4, period: 0 },
  { offering_id: "OFF_CSEB_DS", cohort_id: "CSE-B", subject_id: "SUB-CS101", teacher_id: "F01", room_id: "LAB1", day: 4, period: 1 },
  { offering_id: "OFF_ECEA_DE", cohort_id: "ECE-A", subject_id: "SUB-EC101", teacher_id: "F08", room_id: "R102", day: 4, period: 2 },
]
