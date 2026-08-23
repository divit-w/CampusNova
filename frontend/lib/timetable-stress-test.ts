import type { TimetablePayload } from "@/lib/types"

/**
 * CampusNova / JIIT-style realistic multi-batch stress test payload.
 * 6 cohorts (CSE-A/B/C, ECE-A/B/C), 16 faculty, 16 subjects, 7 rooms, 5 days x 6 periods.
 * Uses the CourseOffering model where each cohort has an independent, realistic curriculum.
 */
export const STRESS_TEST_TIMETABLE_PAYLOAD: TimetablePayload = {
  days_per_week: 5,
  periods_per_day: 6,
  teachers: [
    { id: "F01", name: "Dr. Sharma", max_hours: 14, blocked_slots: [{ day: 4, period: 5 }] },
    { id: "F02", name: "Dr. Verma", max_hours: 14, blocked_slots: [] },
    { id: "F03", name: "Prof. Gupta", max_hours: 14, blocked_slots: [] },
    { id: "F04", name: "Dr. Mukherjee", max_hours: 12, blocked_slots: [] },
    { id: "F05", name: "Prof. Saxena", max_hours: 18, blocked_slots: [] },
    { id: "F06", name: "Dr. Reddy", max_hours: 12, blocked_slots: [] },
    { id: "F07", name: "Dr. Bhattacharya", max_hours: 12, blocked_slots: [] },
    { id: "F08", name: "Prof. Nair", max_hours: 18, blocked_slots: [] },
    { id: "F09", name: "Dr. Kapoor", max_hours: 12, blocked_slots: [] },
    { id: "F10", name: "Dr. Aggarwal", max_hours: 12, blocked_slots: [] },
    { id: "F11", name: "Prof. Joshi", max_hours: 14, blocked_slots: [] },
    { id: "F12", name: "Dr. Mishra", max_hours: 12, blocked_slots: [] },
    { id: "F13", name: "Dr. Choudhury", max_hours: 14, blocked_slots: [] },
    { id: "F14", name: "Prof. Sen", max_hours: 16, blocked_slots: [] },
    { id: "F15", name: "Dr. Iyer", max_hours: 14, blocked_slots: [] },
    { id: "F16", name: "Dr. Thomas", max_hours: 12, blocked_slots: [] },
  ],
  rooms: [
    { id: "R101", name: "LH-101", capacity: 60, room_type: "lecture" },
    { id: "R102", name: "LH-102", capacity: 60, room_type: "lecture" },
    { id: "R103", name: "LH-103", capacity: 60, room_type: "lecture" },
    { id: "R201", name: "TR-201", capacity: 50, room_type: "lecture" },
    { id: "R202", name: "TR-202", capacity: 50, room_type: "lecture" },
    { id: "LAB1", name: "Computing Lab", capacity: 60, room_type: "lab" },
    { id: "LAB2", name: "Hardware Lab", capacity: 60, room_type: "lab" },
  ],
  cohorts: [
    { id: "CSE-A", name: "CSE 3rd Year - Sec A", student_count: 55, blocked_slots: [] },
    { id: "CSE-B", name: "CSE 3rd Year - Sec B", student_count: 58, blocked_slots: [] },
    { id: "CSE-C", name: "CSE 3rd Year - Sec C", student_count: 52, blocked_slots: [] },
    { id: "ECE-A", name: "ECE 3rd Year - Sec A", student_count: 48, blocked_slots: [] },
    { id: "ECE-B", name: "ECE 3rd Year - Sec B", student_count: 50, blocked_slots: [] },
    { id: "ECE-C", name: "ECE 3rd Year - Sec C", student_count: 46, blocked_slots: [] },
  ],
  subjects: [
    { id: "SUB-CS101", name: "Data Structures", room_type: "lab" },
    { id: "SUB-CS102", name: "Operating Systems", room_type: "lecture" },
    { id: "SUB-CS103", name: "Database Management Systems", room_type: "lecture" },
    { id: "SUB-CS104", name: "Computer Networks", room_type: "lecture" },
    { id: "SUB-CS105", name: "Computer Architecture", room_type: "lecture" },
    { id: "SUB-CS106", name: "Software Engineering", room_type: "lecture" },
    { id: "SUB-CS107", name: "Theory of Computation", room_type: "lecture" },
    { id: "SUB-EC101", name: "Digital Electronics", room_type: "lab" },
    { id: "SUB-EC102", name: "Signals & Systems", room_type: "lecture" },
    { id: "SUB-EC103", name: "Analog Circuits", room_type: "lecture" },
    { id: "SUB-EC104", name: "Microprocessors & Interfacing", room_type: "lecture" },
    { id: "SUB-EC105", name: "Communication Systems", room_type: "lecture" },
    { id: "SUB-EC106", name: "Electromagnetic Waves", room_type: "lecture" },
    { id: "SUB-BS101", name: "Discrete Mathematics", room_type: "lecture" },
    { id: "SUB-BS102", name: "Engineering Mathematics III", room_type: "lecture" },
    { id: "SUB-HS101", name: "Technical Communication", room_type: "lecture" },
  ],
  course_offerings: [
    // ── CSE-A (20 hrs) ───────────────────────────────────────────────
    { id: "OFF_CSEA_DS", cohort_id: "CSE-A", subject_id: "SUB-CS101", required_weekly_hours: 4, qualified_teacher_ids: ["F01", "F03"], allowed_room_ids: ["LAB1", "R101", "R102", "R103"] },
    { id: "OFF_CSEA_OS", cohort_id: "CSE-A", subject_id: "SUB-CS102", required_weekly_hours: 4, qualified_teacher_ids: ["F03"] },
    { id: "OFF_CSEA_DBMS", cohort_id: "CSE-A", subject_id: "SUB-CS103", required_weekly_hours: 3, qualified_teacher_ids: ["F02"] },
    { id: "OFF_CSEA_CN", cohort_id: "CSE-A", subject_id: "SUB-CS104", required_weekly_hours: 3, qualified_teacher_ids: ["F04"] },
    { id: "OFF_CSEA_DM", cohort_id: "CSE-A", subject_id: "SUB-BS101", required_weekly_hours: 4, qualified_teacher_ids: ["F05", "F13"] },
    { id: "OFF_CSEA_TC", cohort_id: "CSE-A", subject_id: "SUB-HS101", required_weekly_hours: 2, qualified_teacher_ids: ["F14"] },

    // ── CSE-B (20 hrs) ───────────────────────────────────────────────
    { id: "OFF_CSEB_DS", cohort_id: "CSE-B", subject_id: "SUB-CS101", required_weekly_hours: 4, qualified_teacher_ids: ["F01", "F03"], allowed_room_ids: ["LAB1", "R101", "R102", "R103"] },
    { id: "OFF_CSEB_OS", cohort_id: "CSE-B", subject_id: "SUB-CS102", required_weekly_hours: 4, qualified_teacher_ids: ["F03"] },
    { id: "OFF_CSEB_DBMS", cohort_id: "CSE-B", subject_id: "SUB-CS103", required_weekly_hours: 3, qualified_teacher_ids: ["F02"] },
    { id: "OFF_CSEB_CA", cohort_id: "CSE-B", subject_id: "SUB-CS105", required_weekly_hours: 3, qualified_teacher_ids: ["F06"] },
    { id: "OFF_CSEB_DM", cohort_id: "CSE-B", subject_id: "SUB-BS101", required_weekly_hours: 4, qualified_teacher_ids: ["F05", "F13"] },
    { id: "OFF_CSEB_TC", cohort_id: "CSE-B", subject_id: "SUB-HS101", required_weekly_hours: 2, qualified_teacher_ids: ["F14"] },

    // ── CSE-C (20 hrs) ───────────────────────────────────────────────
    { id: "OFF_CSEC_DS", cohort_id: "CSE-C", subject_id: "SUB-CS101", required_weekly_hours: 4, qualified_teacher_ids: ["F01", "F03"], allowed_room_ids: ["LAB1", "R101", "R102", "R103"] },
    { id: "OFF_CSEC_SE", cohort_id: "CSE-C", subject_id: "SUB-CS106", required_weekly_hours: 3, qualified_teacher_ids: ["F07"] },
    { id: "OFF_CSEC_DBMS", cohort_id: "CSE-C", subject_id: "SUB-CS103", required_weekly_hours: 3, qualified_teacher_ids: ["F02"] },
    { id: "OFF_CSEC_TOC", cohort_id: "CSE-C", subject_id: "SUB-CS107", required_weekly_hours: 4, qualified_teacher_ids: ["F16"] },
    { id: "OFF_CSEC_DM", cohort_id: "CSE-C", subject_id: "SUB-BS101", required_weekly_hours: 4, qualified_teacher_ids: ["F05", "F13"] },
    { id: "OFF_CSEC_TC", cohort_id: "CSE-C", subject_id: "SUB-HS101", required_weekly_hours: 2, qualified_teacher_ids: ["F14"] },

    // ── ECE-A (20 hrs) ───────────────────────────────────────────────
    { id: "OFF_ECEA_DE", cohort_id: "ECE-A", subject_id: "SUB-EC101", required_weekly_hours: 4, qualified_teacher_ids: ["F08"], allowed_room_ids: ["LAB2", "R101", "R102", "R103", "R201", "R202"] },
    { id: "OFF_ECEA_SS", cohort_id: "ECE-A", subject_id: "SUB-EC102", required_weekly_hours: 4, qualified_teacher_ids: ["F08", "F15"] },
    { id: "OFF_ECEA_AC", cohort_id: "ECE-A", subject_id: "SUB-EC103", required_weekly_hours: 3, qualified_teacher_ids: ["F09"] },
    { id: "OFF_ECEA_MP", cohort_id: "ECE-A", subject_id: "SUB-EC104", required_weekly_hours: 3, qualified_teacher_ids: ["F10"] },
    { id: "OFF_ECEA_M3", cohort_id: "ECE-A", subject_id: "SUB-BS102", required_weekly_hours: 4, qualified_teacher_ids: ["F05", "F13"] },
    { id: "OFF_ECEA_TC", cohort_id: "ECE-A", subject_id: "SUB-HS101", required_weekly_hours: 2, qualified_teacher_ids: ["F14"] },

    // ── ECE-B (20 hrs) ───────────────────────────────────────────────
    { id: "OFF_ECEB_DE", cohort_id: "ECE-B", subject_id: "SUB-EC101", required_weekly_hours: 4, qualified_teacher_ids: ["F08"], allowed_room_ids: ["LAB2", "R101", "R102", "R103", "R201", "R202"] },
    { id: "OFF_ECEB_SS", cohort_id: "ECE-B", subject_id: "SUB-EC102", required_weekly_hours: 4, qualified_teacher_ids: ["F08", "F15"] },
    { id: "OFF_ECEB_AC", cohort_id: "ECE-B", subject_id: "SUB-EC103", required_weekly_hours: 3, qualified_teacher_ids: ["F09"] },
    { id: "OFF_ECEB_CS", cohort_id: "ECE-B", subject_id: "SUB-EC105", required_weekly_hours: 3, qualified_teacher_ids: ["F11"] },
    { id: "OFF_ECEB_M3", cohort_id: "ECE-B", subject_id: "SUB-BS102", required_weekly_hours: 4, qualified_teacher_ids: ["F05", "F13"] },
    { id: "OFF_ECEB_TC", cohort_id: "ECE-B", subject_id: "SUB-HS101", required_weekly_hours: 2, qualified_teacher_ids: ["F14"] },

    // ── ECE-C (20 hrs) ───────────────────────────────────────────────
    { id: "OFF_ECEC_DE", cohort_id: "ECE-C", subject_id: "SUB-EC101", required_weekly_hours: 4, qualified_teacher_ids: ["F08"], allowed_room_ids: ["LAB2", "R101", "R102", "R103", "R201", "R202"] },
    { id: "OFF_ECEC_SS", cohort_id: "ECE-C", subject_id: "SUB-EC102", required_weekly_hours: 4, qualified_teacher_ids: ["F08", "F15"] },
    { id: "OFF_ECEC_EM", cohort_id: "ECE-C", subject_id: "SUB-EC106", required_weekly_hours: 3, qualified_teacher_ids: ["F12"] },
    { id: "OFF_ECEC_MP", cohort_id: "ECE-C", subject_id: "SUB-EC104", required_weekly_hours: 3, qualified_teacher_ids: ["F10"] },
    { id: "OFF_ECEC_M3", cohort_id: "ECE-C", subject_id: "SUB-BS102", required_weekly_hours: 4, qualified_teacher_ids: ["F05", "F13"] },
    { id: "OFF_ECEC_TC", cohort_id: "ECE-C", subject_id: "SUB-HS101", required_weekly_hours: 2, qualified_teacher_ids: ["F14"] },
  ],
  hard_constraints: ["no_double_booking", "max_hours_respected", "qualified_faculty_only"],
  fixed_slots: [
    { subject_id: "SUB-CS101", cohort_id: "CSE-A", day: 0, period: 0, room_id: "LAB1" },
    { subject_id: "SUB-EC101", cohort_id: "ECE-A", day: 0, period: 0, room_id: "LAB2" },
  ],
  weight_faculty_gaps: 1.0,
  weight_subject_spread: 2.0,
}
