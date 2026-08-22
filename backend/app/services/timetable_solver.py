from ortools.sat.python import cp_model
from app.schemas.timetable import TimetableConstraintPayload, HardConstraint

class TimetableSolver:
    def __init__(self, payload: TimetableConstraintPayload):
        self.payload = payload
        self.assignments = {}

    def solve(self):
        model = cp_model.CpModel()
        
        # 1. 6D Decision Variables
        for day in range(self.payload.days_per_week):
            for period in range(self.payload.periods_per_day):
                for t in self.payload.teachers:
                    for c in self.payload.cohorts:
                        for r in self.payload.rooms:
                            for s in self.payload.subjects:
                                var_name = f"t{t.id}_c{c.id}_r{r.id}_s{s.id}_d{day}_p{period}"
                                self.assignments[(t.id, c.id, r.id, s.id, day, period)] = model.NewBoolVar(var_name)
                                
        # 2. Hard Constraints
        
        # Teacher Non-Overlapping
        for day in range(self.payload.days_per_week):
            for period in range(self.payload.periods_per_day):
                for t in self.payload.teachers:
                    vars_for_tp = []
                    for c in self.payload.cohorts:
                        for r in self.payload.rooms:
                            for s in self.payload.subjects:
                                vars_for_tp.append(self.assignments[(t.id, c.id, r.id, s.id, day, period)])
                    model.AddAtMostOne(vars_for_tp)

        # Cohort Non-Overlapping
        for day in range(self.payload.days_per_week):
            for period in range(self.payload.periods_per_day):
                for c in self.payload.cohorts:
                    vars_for_cp = []
                    for t in self.payload.teachers:
                        for r in self.payload.rooms:
                            for s in self.payload.subjects:
                                vars_for_cp.append(self.assignments[(t.id, c.id, r.id, s.id, day, period)])
                    model.AddAtMostOne(vars_for_cp)

        # Room Non-Overlapping
        for day in range(self.payload.days_per_week):
            for period in range(self.payload.periods_per_day):
                for r in self.payload.rooms:
                    vars_for_rp = []
                    for t in self.payload.teachers:
                        for c in self.payload.cohorts:
                            for s in self.payload.subjects:
                                vars_for_rp.append(self.assignments[(t.id, c.id, r.id, s.id, day, period)])
                    model.AddAtMostOne(vars_for_rp)

        # Subject Weekly Required Hours
        for c in self.payload.cohorts:
            for s in self.payload.subjects:
                vars_for_cs = []
                for t in self.payload.teachers:
                    for r in self.payload.rooms:
                        for day in range(self.payload.days_per_week):
                            for period in range(self.payload.periods_per_day):
                                vars_for_cs.append(self.assignments[(t.id, c.id, r.id, s.id, day, period)])
                model.Add(sum(vars_for_cs) == s.required_weekly_hours)

        # Teacher Max Hours
        if HardConstraint.MAX_HOURS_RESPECTED in self.payload.hard_constraints:
            for t in self.payload.teachers:
                vars_for_t = []
                for c in self.payload.cohorts:
                    for r in self.payload.rooms:
                        for s in self.payload.subjects:
                            for day in range(self.payload.days_per_week):
                                for period in range(self.payload.periods_per_day):
                                    vars_for_t.append(self.assignments[(t.id, c.id, r.id, s.id, day, period)])
                model.Add(sum(vars_for_t) <= t.max_hours)

        # Fixed Slots
        for fixed in self.payload.fixed_slots:
            fixed_vars = []
            for t in self.payload.teachers:
                rooms_to_check = [r for r in self.payload.rooms if r.id == fixed.room_id] if fixed.room_id else self.payload.rooms
                for r in rooms_to_check:
                    # fixed.day and fixed.period are assumed to be valid bounds
                    if 0 <= fixed.day < self.payload.days_per_week and 0 <= fixed.period < self.payload.periods_per_day:
                        fixed_vars.append(self.assignments[(t.id, fixed.cohort_id, r.id, fixed.subject_id, fixed.day, fixed.period)])
            if fixed_vars:
                # Force exactly one of these combinations to be 1
                model.Add(sum(fixed_vars) == 1)

        # 3. Soft Constraints (Optimization)
        objective_terms = []

        # Faculty Idle Gap Penalty
        gap_weight_int = int(self.payload.weight_faculty_gaps * 1000)
        if gap_weight_int > 0:
            for t in self.payload.teachers:
                for day in range(self.payload.days_per_week):
                    active_periods = []
                    for period in range(self.payload.periods_per_day):
                        active_p = model.NewBoolVar(f"active_t{t.id}_d{day}_p{period}")
                        assignments_tp = [
                            self.assignments[(t.id, c.id, r.id, s.id, day, period)]
                            for c in self.payload.cohorts
                            for r in self.payload.rooms
                            for s in self.payload.subjects
                        ]
                        # active_p == 1 iff teacher is teaching during this period
                        model.AddMaxEquality(active_p, assignments_tp)
                        active_periods.append(active_p)
                        
                    # Linearized span calculation: span = sum(y) + sum(z) - periods_per_day
                    y = [model.NewBoolVar(f"y_t{t.id}_d{day}_p{p}") for p in range(self.payload.periods_per_day)]
                    z = [model.NewBoolVar(f"z_t{t.id}_d{day}_p{p}") for p in range(self.payload.periods_per_day)]
                    
                    for p in range(self.payload.periods_per_day):
                        model.Add(y[p] >= active_periods[p])
                        model.Add(z[p] >= active_periods[p])
                        if p > 0:
                            model.Add(y[p] >= y[p-1])
                        if p < self.payload.periods_per_day - 1:
                            model.Add(z[p] >= z[p+1])
                            
                    span = sum(y) + sum(z) - self.payload.periods_per_day
                    classes_taught = sum(active_periods)
                    gaps = span - classes_taught
                    
                    objective_terms.append(gaps * gap_weight_int)

        # Subject Daily Spread Penalty
        spread_weight_int = int(self.payload.weight_subject_spread * 1000)
        if spread_weight_int > 0:
            for c in self.payload.cohorts:
                for s in self.payload.subjects:
                    for day in range(self.payload.days_per_week):
                        assignments_csd = []
                        for period in range(self.payload.periods_per_day):
                            for t in self.payload.teachers:
                                for r in self.payload.rooms:
                                    assignments_csd.append(self.assignments[(t.id, c.id, r.id, s.id, day, period)])
                        sum_csd = sum(assignments_csd)
                        penalty_var = model.NewIntVar(0, self.payload.periods_per_day, f"spread_pen_c{c.id}_s{s.id}_d{day}")
                        model.Add(penalty_var >= 0)
                        model.Add(penalty_var >= sum_csd - 1)
                        objective_terms.append(penalty_var * spread_weight_int)

        if objective_terms:
            model.Minimize(sum(objective_terms))

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 10.0
        status = solver.Solve(model)
        
        if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
            schedule = []
            for (t_id, c_id, r_id, s_id, day, period), var in self.assignments.items():
                if solver.Value(var) == 1:
                    schedule.append({
                        "teacher_id": t_id,
                        "cohort_id": c_id,
                        "room_id": r_id,
                        "subject_id": s_id,
                        "day": day,
                        "period": period
                    })
            return {"status": solver.StatusName(status), "schedule": schedule}
        
        return {"status": solver.StatusName(status), "schedule": []}
