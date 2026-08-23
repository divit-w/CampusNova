import type { ScheduleEntry, TimetablePayload, FixedSlotRequirement } from "@/lib/types"

export interface MoveValidationResult {
  valid: boolean
  reason?: string
}

/**
 * Checks if a specific schedule entry is pinned by an explicit fixed-slot constraint.
 * Matches on subject_id, cohort_id, day, period, and optional room_id (ignoring "BLOCKED" placeholder slots).
 */
export function isEntryPinned(entry: ScheduleEntry, fixedSlots: FixedSlotRequirement[] = []): boolean {
  if (!fixedSlots || fixedSlots.length === 0) return false
  return fixedSlots.some(
    (fs) =>
      fs.subject_id !== "BLOCKED" &&
      fs.subject_id === entry.subject_id &&
      fs.cohort_id === entry.cohort_id &&
      fs.day === entry.day &&
      fs.period === entry.period &&
      (!fs.room_id || fs.room_id === entry.room_id),
  )
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

/**
 * Validates whether moving a schedule entry to (targetDay, targetPeriod) satisfies all hard constraints.
 * The dragged entry is explicitly excluded from the remaining schedule when evaluating target slot occupancy.
 */
export function validateScheduleMove(
  draggedIndex: number,
  targetDay: number,
  targetPeriod: number,
  currentSchedule: ScheduleEntry[],
  payload: TimetablePayload,
): MoveValidationResult {
  const draggedEntry = currentSchedule[draggedIndex]
  if (!draggedEntry) {
    return { valid: false, reason: "Selected timetable block was not found." }
  }

  // 1. Same position check (no-op)
  if (draggedEntry.day === targetDay && draggedEntry.period === targetPeriod) {
    return { valid: true }
  }

  // Lookups for clear error messages
  const teacherName = payload.teachers.find((t) => t.id === draggedEntry.teacher_id)?.name ?? draggedEntry.teacher_id
  const subjectName = payload.subjects.find((s) => s.id === draggedEntry.subject_id)?.name ?? draggedEntry.subject_id
  const cohortName = payload.cohorts.find((c) => c.id === draggedEntry.cohort_id)?.name ?? draggedEntry.cohort_id
  const targetDayName = DAY_NAMES[targetDay] ?? `Day ${targetDay + 1}`
  const targetPeriodLabel = `P${targetPeriod + 1}`

  // 2. Bounds check
  if (targetDay < 0 || targetDay >= payload.days_per_week || targetPeriod < 0 || targetPeriod >= payload.periods_per_day) {
    return {
      valid: false,
      reason: `Destination ${targetDayName} ${targetPeriodLabel} is outside the scheduled timetable window.`,
    }
  }

  // 3. Pinned class check (classes pinned by fixed_slots cannot be moved)
  if (isEntryPinned(draggedEntry, payload.fixed_slots)) {
    return {
      valid: false,
      reason: `Cannot move ${subjectName} — this session is pinned by a fixed schedule requirement.`,
    }
  }

  // 4. Destination fixed slot / blocked check
  const fixedSlotConflict = (payload.fixed_slots || []).find(
    (fs) => fs.cohort_id === draggedEntry.cohort_id && fs.day === targetDay && fs.period === targetPeriod,
  )
  if (fixedSlotConflict) {
    if (fixedSlotConflict.subject_id === "BLOCKED") {
      return {
        valid: false,
        reason: `Cannot move ${subjectName} to ${targetDayName} ${targetPeriodLabel} — ${cohortName} has a blocked period (e.g. Assembly/Activity).`,
      }
    }
    const fixedSubName =
      payload.subjects.find((s) => s.id === fixedSlotConflict.subject_id)?.name ?? fixedSlotConflict.subject_id
    return {
      valid: false,
      reason: `Cannot move ${subjectName} to ${targetDayName} ${targetPeriodLabel} — this slot is reserved for ${fixedSubName}.`,
    }
  }

  // 5. Exclude dragged entry from the candidate schedule before checking conflicts
  const remainingSchedule = currentSchedule.filter((_, idx) => idx !== draggedIndex)

  // 6. Cohort collision check (never overwrite or double-book cohort)
  const cohortCollision = remainingSchedule.find(
    (e) => e.cohort_id === draggedEntry.cohort_id && e.day === targetDay && e.period === targetPeriod,
  )
  if (cohortCollision) {
    const existingSubName =
      payload.subjects.find((s) => s.id === cohortCollision.subject_id)?.name ?? cohortCollision.subject_id
    return {
      valid: false,
      reason: `Cannot move ${subjectName} to ${targetDayName} ${targetPeriodLabel} — this slot is already occupied by ${existingSubName}.`,
    }
  }

  // 7. Teacher availability check (blocked slots)
  const teacher = payload.teachers.find((t) => t.id === draggedEntry.teacher_id)
  const teacherBlocked = teacher?.blocked_slots || teacher?.blocked_periods || []
  if (teacherBlocked.length > 0) {
    const isBlocked = teacherBlocked.some((bp) => bp.day === targetDay && bp.period === targetPeriod)
    if (isBlocked) {
      return {
        valid: false,
        reason: `Cannot move ${subjectName} to ${targetDayName} ${targetPeriodLabel} — ${teacherName} is unavailable during this period.`,
      }
    }
  }

  // 7b. Cohort availability check (cohort blocked slots)
  const cohort = payload.cohorts.find((c) => c.id === draggedEntry.cohort_id)
  const cohortBlocked = cohort?.blocked_slots || []
  if (cohortBlocked.length > 0) {
    const isCohortBlocked = cohortBlocked.some((bp) => bp.day === targetDay && bp.period === targetPeriod)
    if (isCohortBlocked) {
      return {
        valid: false,
        reason: `Cannot move ${subjectName} to ${targetDayName} ${targetPeriodLabel} — ${cohortName} has a blocked period.`,
      }
    }
  }

  // 8. Teacher double booking check (teaching another cohort at target slot)
  const teacherCollision = remainingSchedule.find(
    (e) => e.teacher_id === draggedEntry.teacher_id && e.day === targetDay && e.period === targetPeriod,
  )
  if (teacherCollision) {
    const otherCohortName =
      payload.cohorts.find((c) => c.id === teacherCollision.cohort_id)?.name ?? teacherCollision.cohort_id
    return {
      valid: false,
      reason: `Cannot move ${subjectName} to ${targetDayName} ${targetPeriodLabel} — ${teacherName} is already teaching ${otherCohortName} during this period.`,
    }
  }

  // 9. Room double booking check (room used by another class at target slot)
  const roomCollision = remainingSchedule.find(
    (e) => e.room_id === draggedEntry.room_id && e.day === targetDay && e.period === targetPeriod,
  )
  if (roomCollision) {
    const occCohort =
      payload.cohorts.find((c) => c.id === roomCollision.cohort_id)?.name ?? roomCollision.cohort_id
    const occSubject =
      payload.subjects.find((s) => s.id === roomCollision.subject_id)?.name ?? roomCollision.subject_id
    return {
      valid: false,
      reason: `Cannot move ${subjectName} to ${targetDayName} ${targetPeriodLabel} — Room ${draggedEntry.room_id} is already occupied by ${occCohort} (${occSubject}).`,
    }
  }

  return { valid: true }
}
