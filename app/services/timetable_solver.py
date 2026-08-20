from ortools.sat.python import cp_model
from app.schemas.timetable import TimetableConstraintPayload, HardConstraint

class TimetableSolver:
    def __init__(self, payload: TimetableConstraintPayload):
        self.payload = payload
        self.assignments = {}

    def solve(self):
        model = cp_model.CpModel()
        
        # Iterate through dimensions and create a boolean variable for each combination
        for day in range(self.payload.days_per_week):
            for period in range(self.payload.periods_per_day):
                for t in self.payload.teachers:
                    for r in self.payload.rooms:
                        for s in self.payload.subjects:
                            var_name = f"t{t.id}_r{r.id}_s{s.id}_d{day}_p{period}"
                            self.assignments[(t.id, r.id, s.id, day, period)] = model.NewBoolVar(var_name)
                            
        # Enforce HardConstraint.NO_DOUBLE_BOOKING if present
        if HardConstraint.NO_DOUBLE_BOOKING in self.payload.hard_constraints:
            for day in range(self.payload.days_per_week):
                for period in range(self.payload.periods_per_day):
                    for t in self.payload.teachers:
                        # Collect all boolean variables for this specific teacher at this day & period
                        vars_for_teacher_period = []
                        for r in self.payload.rooms:
                            for s in self.payload.subjects:
                                vars_for_teacher_period.append(
                                    self.assignments[(t.id, r.id, s.id, day, period)]
                                )
                        # Enforce maximum of 1 room/subject assignment per teacher, per period
                        model.AddAtMostOne(vars_for_teacher_period)
                # Room Uniqueness: ensure a room is used at most once per period
        for day in range(self.payload.days_per_week):
            for period in range(self.payload.periods_per_day):
                for r in self.payload.rooms:
                    vars_for_room_period = []
                    for t in self.payload.teachers:
                        for s in self.payload.subjects:
                            vars_for_room_period.append(
                                self.assignments[(t.id, r.id, s.id, day, period)]
                            )
                    model.AddAtMostOne(vars_for_room_period)

        # Subject Fulfillment: ensure exactly required_weekly_hours for each subject
        for s in self.payload.subjects:
            vars_for_subject = []
            for t in self.payload.teachers:
                for r in self.payload.rooms:
                    for day in range(self.payload.days_per_week):
                        for period in range(self.payload.periods_per_day):
                            vars_for_subject.append(
                                self.assignments[(t.id, r.id, s.id, day, period)]
                            )
            model.Add(sum(vars_for_subject) == s.required_weekly_hours)

        # Teacher Max Hours: if HardConstraint.MAX_HOURS_RESPECTED is present
        if HardConstraint.MAX_HOURS_RESPECTED in self.payload.hard_constraints:
            for t in self.payload.teachers:
                vars_for_teacher = []
                for r in self.payload.rooms:
                    for s in self.payload.subjects:
                        for day in range(self.payload.days_per_week):
                            for period in range(self.payload.periods_per_day):
                                vars_for_teacher.append(
                                    self.assignments[(t.id, r.id, s.id, day, period)]
                                )
                model.Add(sum(vars_for_teacher) <= t.max_hours)

        # Execute solver — hard 10-second cap prevents infinite hangs on over-constrained inputs
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 10.0
        status = solver.Solve(model)
        
        if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
            schedule = []
            for (t_id, r_id, s_id, day, period), var in self.assignments.items():
                if solver.Value(var) == 1:
                    schedule.append({
                        "teacher_id": t_id,
                        "room_id": r_id,
                        "subject_id": s_id,
                        "day": day,
                        "period": period
                    })
            return {"status": solver.StatusName(status), "schedule": schedule}
        
        return {"status": solver.StatusName(status), "schedule": []}
