import type { TimetablePayload, ScheduleEntry, DetectedConflict } from "@/lib/types"

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

/**
 * Inspects a raw schedule matrix against timetable constraints and identifies
 * all hard constraint violations and scheduling collisions with clear explanations.
 */
export function detectScheduleConflicts(
  schedule: ScheduleEntry[],
  payload: TimetablePayload
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = []

  const teacherMap = Object.fromEntries(payload.teachers.map((t) => [t.id, t]))
  const roomMap = Object.fromEntries(payload.rooms.map((r) => [r.id, r]))
  const cohortMap = Object.fromEntries(payload.cohorts.map((c) => [c.id, c]))
  const subjectMap = Object.fromEntries(payload.subjects.map((s) => [s.id, s]))
  const offeringMap = Object.fromEntries((payload.course_offerings || []).map((o) => [o.id, o]))

  // Index entries by slot keys
  const entriesByTeacherSlot = new Map<string, { entry: ScheduleEntry; index: number }[]>()
  const entriesByRoomSlot = new Map<string, { entry: ScheduleEntry; index: number }[]>()
  const entriesByCohortSlot = new Map<string, { entry: ScheduleEntry; index: number }[]>()

  schedule.forEach((entry, idx) => {
    if (entry.subject_id === "BLOCKED") return

    const tKey = `${entry.teacher_id}_${entry.day}_${entry.period}`
    const rKey = `${entry.room_id}_${entry.day}_${entry.period}`
    const cKey = `${entry.cohort_id}_${entry.day}_${entry.period}`

    const tList = entriesByTeacherSlot.get(tKey) || []
    tList.push({ entry, index: idx })
    entriesByTeacherSlot.set(tKey, tList)

    const rList = entriesByRoomSlot.get(rKey) || []
    rList.push({ entry, index: idx })
    entriesByRoomSlot.set(rKey, rList)

    const cList = entriesByCohortSlot.get(cKey) || []
    cList.push({ entry, index: idx })
    entriesByCohortSlot.set(cKey, cList)
  })

  // 1. Teacher Double-Bookings
  entriesByTeacherSlot.forEach((items, key) => {
    if (items.length > 1) {
      const first = items[0].entry
      const tName = teacherMap[first.teacher_id]?.name || first.teacher_id
      const dayName = DAY_NAMES[first.day] || `Day ${first.day + 1}`
      const pLabel = `Period ${first.period + 1}`
      const cohortNames = items.map((i) => cohortMap[i.entry.cohort_id]?.name || i.entry.cohort_id).join(" and ")

      conflicts.push({
        id: `conflict-t-double-${key}`,
        type: "teacher_double_booking",
        severity: "critical",
        day: first.day,
        period: first.period,
        teacher_id: first.teacher_id,
        title: `Faculty Double-Booking: ${tName}`,
        description: `${tName} is scheduled to teach ${items.length} classes concurrently (${cohortNames}) on ${dayName} ${pLabel}.`,
        affected_entry_indices: items.map((i) => i.index),
      })
    }
  })

  // 2. Room Double-Bookings
  entriesByRoomSlot.forEach((items, key) => {
    if (items.length > 1) {
      const first = items[0].entry
      const rName = roomMap[first.room_id]?.name || `Room ${first.room_id}`
      const dayName = DAY_NAMES[first.day] || `Day ${first.day + 1}`
      const pLabel = `Period ${first.period + 1}`
      const subNames = items.map((i) => subjectMap[i.entry.subject_id]?.name || i.entry.subject_id).join(" and ")

      conflicts.push({
        id: `conflict-r-double-${key}`,
        type: "room_double_booking",
        severity: "critical",
        day: first.day,
        period: first.period,
        room_id: first.room_id,
        title: `Room Collision: ${rName}`,
        description: `${rName} is double-booked for multiple subjects (${subNames}) on ${dayName} ${pLabel}.`,
        affected_entry_indices: items.map((i) => i.index),
      })
    }
  })

  // 3. Cohort Double-Bookings (Overlapping classes for the same students)
  entriesByCohortSlot.forEach((items, key) => {
    if (items.length > 1) {
      const first = items[0].entry
      const cName = cohortMap[first.cohort_id]?.name || first.cohort_id
      const dayName = DAY_NAMES[first.day] || `Day ${first.day + 1}`
      const pLabel = `Period ${first.period + 1}`
      const subNames = items.map((i) => subjectMap[i.entry.subject_id]?.name || i.entry.subject_id).join(" and ")

      conflicts.push({
        id: `conflict-c-double-${key}`,
        type: "cohort_double_booking",
        severity: "critical",
        day: first.day,
        period: first.period,
        cohort_id: first.cohort_id,
        title: `Student Cohort Collision: ${cName}`,
        description: `${cName} is assigned to attend ${items.length} classes simultaneously (${subNames}) on ${dayName} ${pLabel}.`,
        affected_entry_indices: items.map((i) => i.index),
      })
    }
  })

  // 4. Per-Entry Single Constraint Checks (Blocked slots, capacity, qualifications)
  schedule.forEach((entry, idx) => {
    if (entry.subject_id === "BLOCKED") return

    const teacher = teacherMap[entry.teacher_id]
    const cohort = cohortMap[entry.cohort_id]
    const room = roomMap[entry.room_id]
    const subject = subjectMap[entry.subject_id]
    const offering = entry.offering_id ? offeringMap[entry.offering_id] : null

    const dayName = DAY_NAMES[entry.day] || `Day ${entry.day + 1}`
    const pLabel = `Period ${entry.period + 1}`
    const tName = teacher?.name || entry.teacher_id
    const cName = cohort?.name || entry.cohort_id
    const rName = room?.name || `Room ${entry.room_id}`
    const sName = subject?.name || entry.subject_id

    // A. Teacher Blocked Slot Violation
    const tBlocked = teacher?.blocked_slots || teacher?.blocked_periods || []
    const isTeacherBlocked = tBlocked.some((b) => b.day === entry.day && b.period === entry.period)
    if (isTeacherBlocked) {
      conflicts.push({
        id: `conflict-t-blocked-${idx}-${entry.day}-${entry.period}`,
        type: "teacher_blocked",
        severity: "critical",
        day: entry.day,
        period: entry.period,
        teacher_id: entry.teacher_id,
        subject_id: entry.subject_id,
        title: `Faculty Blocked-Slot Violation: ${tName}`,
        description: `${tName} is scheduled for ${sName} on ${dayName} ${pLabel}, but is marked as unavailable/blocked during this slot.`,
        affected_entry_indices: [idx],
      })
    }

    // B. Cohort Blocked Slot Violation
    const cBlocked = cohort?.blocked_slots || []
    const isCohortBlocked = cBlocked.some((b) => b.day === entry.day && b.period === entry.period)
    if (isCohortBlocked) {
      conflicts.push({
        id: `conflict-c-blocked-${idx}-${entry.day}-${entry.period}`,
        type: "cohort_blocked",
        severity: "critical",
        day: entry.day,
        period: entry.period,
        cohort_id: entry.cohort_id,
        subject_id: entry.subject_id,
        title: `Cohort Blocked-Slot Violation: ${cName}`,
        description: `${cName} is scheduled for ${sName} on ${dayName} ${pLabel}, which conflicts with an institutional blocked period (e.g. Assembly/Activity).`,
        affected_entry_indices: [idx],
      })
    }

    // C. Room Capacity Violation
    if (room && cohort && room.capacity < cohort.student_count) {
      conflicts.push({
        id: `conflict-capacity-${idx}`,
        type: "capacity_exceeded",
        severity: "critical",
        day: entry.day,
        period: entry.period,
        room_id: entry.room_id,
        cohort_id: entry.cohort_id,
        title: `Room Capacity Overflow: ${rName}`,
        description: `${rName} (capacity: ${room.capacity}) cannot accommodate ${cName} (${cohort.student_count} students) for ${sName} on ${dayName} ${pLabel}.`,
        affected_entry_indices: [idx],
      })
    }

    // D. Unqualified Teacher Assignment
    const qualifiedList = offering?.qualified_teacher_ids || subject?.qualified_teachers || []
    if (qualifiedList.length > 0 && !qualifiedList.includes(entry.teacher_id)) {
      conflicts.push({
        id: `conflict-unqualified-${idx}`,
        type: "unqualified_teacher",
        severity: "critical",
        day: entry.day,
        period: entry.period,
        teacher_id: entry.teacher_id,
        subject_id: entry.subject_id,
        title: `Unqualified Faculty Assignment: ${tName}`,
        description: `${tName} is assigned to teach ${sName} on ${dayName} ${pLabel}, but is not on the qualified instructor list for this course.`,
        affected_entry_indices: [idx],
      })
    }
  })

  return conflicts
}
