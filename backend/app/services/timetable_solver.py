from collections import defaultdict
from typing import Dict, List, Tuple, Any, Optional
from ortools.sat.python import cp_model
from app.schemas.timetable import TimetableConstraintPayload, HardConstraint, CourseOffering

class TimetableSolver:
    def __init__(self, payload: TimetableConstraintPayload):
        self.payload = payload
        self.x: Dict[Tuple[str, str, str, int, int], cp_model.IntVar] = {}

    def validate_payload(self) -> Optional[str]:
        """
        Pre-solve validation: Detect invalid references, impossible requirements,
        or contradictory fixed slots before spending CPU cycles on CP-SAT.
        """
        cohort_ids = {c.id for c in self.payload.cohorts}
        subject_ids = {s.id for s in self.payload.subjects}
        teacher_ids = {t.id for t in self.payload.teachers}
        room_ids = {r.id for r in self.payload.rooms}
        cohort_map = {c.id: c for c in self.payload.cohorts}

        if not self.payload.course_offerings:
            return "No course offerings provided for scheduling."

        total_available_slots = self.payload.days_per_week * self.payload.periods_per_day

        for o in self.payload.course_offerings:
            if o.cohort_id not in cohort_ids:
                return f"Course offering '{o.id}' references unknown cohort '{o.cohort_id}'."
            if o.subject_id not in subject_ids:
                return f"Course offering '{o.id}' references unknown subject '{o.subject_id}'."
            if not o.qualified_teacher_ids:
                return f"Course offering '{o.id}' has no qualified teachers assigned."
            for t_id in o.qualified_teacher_ids:
                if t_id not in teacher_ids:
                    return f"Course offering '{o.id}' references unknown teacher '{t_id}'."
            if o.required_weekly_hours <= 0:
                return f"Course offering '{o.id}' requires invalid weekly hours ({o.required_weekly_hours})."
            if o.required_weekly_hours > total_available_slots:
                return f"Course offering '{o.id}' requires {o.required_weekly_hours} hours, exceeding available slots ({total_available_slots})."
            if o.allowed_room_ids is not None:
                for r_id in o.allowed_room_ids:
                    if r_id not in room_ids:
                        return f"Course offering '{o.id}' references unknown room '{r_id}'."

            # Check room eligibility (capacity + allowed_room_ids)
            cohort = cohort_map[o.cohort_id]
            eligible = [
                r for r in self.payload.rooms
                if (o.allowed_room_ids is None or r.id in o.allowed_room_ids)
                and r.capacity >= cohort.student_count
            ]
            if not eligible:
                return f"Course offering '{o.id}' has no eligible rooms meeting cohort capacity ({cohort.student_count} students)."

        # Validate fixed slots
        fixed_cohort_slots = set()
        fixed_room_slots = set()
        for fs in self.payload.fixed_slots:
            if fs.cohort_id not in cohort_ids:
                return f"Fixed slot references unknown cohort '{fs.cohort_id}'."
            if fs.subject_id not in subject_ids and fs.subject_id != "BLOCKED":
                return f"Fixed slot references unknown subject '{fs.subject_id}'."
            if fs.day < 0 or fs.day >= self.payload.days_per_week or fs.period < 0 or fs.period >= self.payload.periods_per_day:
                return f"Fixed slot day/period ({fs.day}, {fs.period}) is out of timetable bounds."
            if fs.room_id and fs.room_id not in room_ids:
                return f"Fixed slot references unknown room '{fs.room_id}'."

            c_key = (fs.cohort_id, fs.day, fs.period)
            if c_key in fixed_cohort_slots:
                return f"Conflicting fixed slots for cohort '{fs.cohort_id}' at day {fs.day}, period {fs.period}."
            fixed_cohort_slots.add(c_key)

            if fs.room_id:
                r_key = (fs.room_id, fs.day, fs.period)
                if r_key in fixed_room_slots:
                    return f"Conflicting fixed slots for room '{fs.room_id}' at day {fs.day}, period {fs.period}."
                fixed_room_slots.add(r_key)

        return None

    def solve(self) -> Dict[str, Any]:
        # 1. Pre-solve validation
        val_error = self.validate_payload()
        if val_error:
            return {"status": "MODEL_INVALID", "schedule": [], "error": val_error}

        model = cp_model.CpModel()
        cohort_map = {c.id: c for c in self.payload.cohorts}
        teacher_map = {t.id: t for t in self.payload.teachers}
        offering_map = {o.id: o for o in self.payload.course_offerings}

        # Blocked time-slot sets
        teacher_blocked = {
            t.id: {(s.day, s.period) for s in t.blocked_slots}
            for t in self.payload.teachers
        }
        cohort_blocked = {
            c.id: {(s.day, s.period) for s in c.blocked_slots}
            for c in self.payload.cohorts
        }

        # Indexing buckets for fast constraint generation
        vars_by_offering = defaultdict(list)
        vars_by_cohort_slot = defaultdict(list)
        vars_by_teacher_slot = defaultdict(list)
        vars_by_room_slot = defaultdict(list)
        vars_by_teacher = defaultdict(list)
        vars_by_offering_day = defaultdict(list)

        # 2. Sparse Decision Variable Creation: X(offering, teacher, room, day, period)
        for o in self.payload.course_offerings:
            cohort = cohort_map[o.cohort_id]
            eligible_rooms = [
                r for r in self.payload.rooms
                if (o.allowed_room_ids is None or r.id in o.allowed_room_ids)
                and r.capacity >= cohort.student_count
            ]

            for t_id in o.qualified_teacher_ids:
                for r in eligible_rooms:
                    for day in range(self.payload.days_per_week):
                        for period in range(self.payload.periods_per_day):
                            # Hard Constraint: Skip blocked periods for teacher or cohort
                            if (day, period) in teacher_blocked.get(t_id, set()):
                                continue
                            if (day, period) in cohort_blocked.get(o.cohort_id, set()):
                                continue

                            var_name = f"x_{o.id}_t{t_id}_r{r.id}_d{day}_p{period}"
                            var = model.NewBoolVar(var_name)

                            self.x[(o.id, t_id, r.id, day, period)] = var
                            vars_by_offering[o.id].append(var)
                            vars_by_cohort_slot[(o.cohort_id, day, period)].append(var)
                            vars_by_teacher_slot[(t_id, day, period)].append(var)
                            vars_by_room_slot[(r.id, day, period)].append(var)
                            vars_by_teacher[t_id].append(var)
                            vars_by_offering_day[(o.id, day)].append(var)

        # 3. Hard Constraints

        # A. Required Weekly Hours per Offering
        for o in self.payload.course_offerings:
            offering_vars = vars_by_offering.get(o.id, [])
            if not offering_vars:
                return {
                    "status": "INFEASIBLE",
                    "schedule": [],
                    "error": f"No feasible slots available for offering '{o.id}' after applying blocked slots."
                }
            model.Add(sum(offering_vars) == o.required_weekly_hours)

        # B. Cohort Non-Overlapping (At most one class per cohort per slot)
        for (c_id, day, period), slot_vars in vars_by_cohort_slot.items():
            model.AddAtMostOne(slot_vars)

        # C. Teacher Non-Overlapping (At most one class per teacher per slot across all cohorts)
        for (t_id, day, period), slot_vars in vars_by_teacher_slot.items():
            model.AddAtMostOne(slot_vars)

        # D. Room Non-Overlapping (At most one class per room per slot across all cohorts)
        for (r_id, day, period), slot_vars in vars_by_room_slot.items():
            model.AddAtMostOne(slot_vars)

        # E. Teacher Max Hours
        if HardConstraint.MAX_HOURS_RESPECTED in self.payload.hard_constraints:
            for t in self.payload.teachers:
                t_vars = vars_by_teacher.get(t.id, [])
                if t_vars:
                    model.Add(sum(t_vars) <= t.max_hours)

        # F. Fixed Slots
        for fixed in self.payload.fixed_slots:
            if fixed.subject_id == "BLOCKED":
                continue

            fixed_vars = []
            for (o_id, t_id, r_id, day, period), var in self.x.items():
                offering = offering_map[o_id]
                if (
                    offering.cohort_id == fixed.cohort_id
                    and offering.subject_id == fixed.subject_id
                    and day == fixed.day
                    and period == fixed.period
                    and (fixed.room_id is None or r_id == fixed.room_id)
                ):
                    fixed_vars.append(var)

            if fixed_vars:
                model.Add(sum(fixed_vars) == 1)

        # 4. Soft Constraints & Objective Optimization
        objective_terms = []

        # A. Faculty Idle Gap Minimization
        gap_weight_int = int(self.payload.weight_faculty_gaps * 1000)
        if gap_weight_int > 0:
            for t in self.payload.teachers:
                for day in range(self.payload.days_per_week):
                    active_periods = []
                    has_possible_activity = False

                    for period in range(self.payload.periods_per_day):
                        t_slot_vars = vars_by_teacher_slot.get((t.id, day, period), [])
                        if t_slot_vars:
                            active_p = model.NewBoolVar(f"act_t{t.id}_d{day}_p{period}")
                            model.AddMaxEquality(active_p, t_slot_vars)
                            active_periods.append(active_p)
                            has_possible_activity = True
                        else:
                            active_periods.append(model.NewConstant(0))

                    if has_possible_activity:
                        y = [model.NewBoolVar(f"y_t{t.id}_d{day}_p{p}") for p in range(self.payload.periods_per_day)]
                        z = [model.NewBoolVar(f"z_t{t.id}_d{day}_p{p}") for p in range(self.payload.periods_per_day)]

                        for p in range(self.payload.periods_per_day):
                            model.Add(y[p] >= active_periods[p])
                            model.Add(z[p] >= active_periods[p])
                            if p > 0:
                                model.Add(y[p] >= y[p - 1])
                            if p < self.payload.periods_per_day - 1:
                                model.Add(z[p] >= z[p + 1])

                        span = sum(y) + sum(z) - self.payload.periods_per_day
                        classes_taught = sum(active_periods)
                        gaps = span - classes_taught
                        objective_terms.append(gaps * gap_weight_int)

        # B. Subject Daily Spread Penalty
        spread_weight_int = int(self.payload.weight_subject_spread * 1000)
        if spread_weight_int > 0:
            for o in self.payload.course_offerings:
                for day in range(self.payload.days_per_week):
                    day_vars = vars_by_offering_day.get((o.id, day), [])
                    if len(day_vars) > 1:
                        sum_od = sum(day_vars)
                        penalty_var = model.NewIntVar(0, self.payload.periods_per_day, f"spread_{o.id}_d{day}")
                        model.Add(penalty_var >= 0)
                        model.Add(penalty_var >= sum_od - 1)
                        objective_terms.append(penalty_var * spread_weight_int)

        if objective_terms:
            model.Minimize(sum(objective_terms))

        # 5. Solver Invocation
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 10.0
        solver.parameters.num_search_workers = 8
        status = solver.Solve(model)
        status_name = solver.StatusName(status)

        if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
            schedule = []
            for (o_id, t_id, r_id, day, period), var in self.x.items():
                if solver.Value(var) == 1:
                    offering = offering_map[o_id]
                    schedule.append({
                        "offering_id": o_id,
                        "cohort_id": offering.cohort_id,
                        "subject_id": offering.subject_id,
                        "teacher_id": t_id,
                        "room_id": r_id,
                        "day": day,
                        "period": period,
                    })
            return {
                "status": status_name,
                "schedule": schedule,
                "solve_time_ms": int(solver.WallTime() * 1000),
            }

        if status == cp_model.INFEASIBLE:
            return {
                "status": "INFEASIBLE",
                "schedule": [],
                "error": "The specified constraints are mathematically unsatisfiable (INFEASIBLE).",
            }

        if status == cp_model.UNKNOWN:
            return {
                "status": "UNKNOWN",
                "schedule": [],
                "error": "Solver timed out after 10.0s without finding a feasible solution.",
            }

        return {
            "status": status_name,
            "schedule": [],
            "error": f"Solver finished with status {status_name}.",
        }

