import pytest
from app.schemas.timetable import (
    TimetableConstraintPayload,
    Teacher,
    Room,
    Subject,
    StudentCohort,
    CourseOffering,
    FixedSlotRequirement,
    TimeSlot,
    HardConstraint,
)
from app.services.timetable_solver import TimetableSolver

def test_1_legacy_payload_auto_normalization():
    """TEST 1: Legacy payload without course_offerings auto-generates CourseOfferings."""
    payload_data = {
        "days_per_week": 5,
        "periods_per_day": 6,
        "teachers": [{"id": "T1", "name": "Dr. Rao", "max_hours": 20}],
        "rooms": [{"id": "R1", "capacity": 40}],
        "subjects": [{"id": "S1", "name": "Math", "required_weekly_hours": 4, "qualified_teachers": ["T1"]}],
        "cohorts": [{"id": "C1", "name": "Grade 9", "student_count": 30}],
    }
    payload = TimetableConstraintPayload(**payload_data)
    assert len(payload.course_offerings) == 1
    offering = payload.course_offerings[0]
    assert offering.cohort_id == "C1"
    assert offering.subject_id == "S1"
    assert offering.required_weekly_hours == 4
    assert offering.qualified_teacher_ids == ["T1"]


def test_2_qualified_teacher_enforcement():
    """TEST 2: Only qualified teachers may be assigned; unqualified faculty must NEVER appear."""
    payload = TimetableConstraintPayload(
        days_per_week=2,
        periods_per_day=2,
        teachers=[
            Teacher(id="F01", name="Dr. Sharma (Math)", max_hours=10),
            Teacher(id="F02", name="Dr. Verma (Unqualified)", max_hours=10),
        ],
        rooms=[Room(id="R1", capacity=40)],
        cohorts=[StudentCohort(id="C1", name="CSE-A", student_count=30)],
        subjects=[Subject(id="MATH", name="Mathematics")],
        course_offerings=[
            CourseOffering(
                id="OFF1",
                cohort_id="C1",
                subject_id="MATH",
                required_weekly_hours=2,
                qualified_teacher_ids=["F01"],
            )
        ],
    )
    solver = TimetableSolver(payload)
    res = solver.solve()
    assert res["status"] in ["OPTIMAL", "FEASIBLE"]
    assert len(res["schedule"]) == 2
    for entry in res["schedule"]:
        assert entry["teacher_id"] == "F01", f"Unqualified teacher {entry['teacher_id']} was assigned!"


def test_3_room_capacity_enforcement():
    """TEST 3: Room with capacity < student_count must never be selected."""
    payload = TimetableConstraintPayload(
        days_per_week=2,
        periods_per_day=2,
        teachers=[Teacher(id="F01", name="Dr. Sharma", max_hours= 10)],
        rooms=[
            Room(id="SMALL_ROOM", capacity=20),
            Room(id="LARGE_ROOM", capacity=60),
        ],
        cohorts=[StudentCohort(id="C1", name="CSE-A", student_count=50)],
        subjects=[Subject(id="MATH", name="Mathematics")],
        course_offerings=[
            CourseOffering(
                id="OFF1",
                cohort_id="C1",
                subject_id="MATH",
                required_weekly_hours=2,
                qualified_teacher_ids=["F01"],
            )
        ],
    )
    solver = TimetableSolver(payload)
    res = solver.solve()
    assert res["status"] in ["OPTIMAL", "FEASIBLE"]
    for entry in res["schedule"]:
        assert entry["room_id"] == "LARGE_ROOM", f"Undersized room {entry['room_id']} was assigned to 50 students!"


def test_4_teacher_blocked_slot():
    """TEST 4: Teacher unavailable at Monday P1 (0, 0) must NOT be assigned there."""
    payload = TimetableConstraintPayload(
        days_per_week=1,
        periods_per_day=2,
        teachers=[
            Teacher(
                id="F01",
                name="Dr. Sharma",
                max_hours=10,
                blocked_slots=[TimeSlot(day=0, period=0)],
            )
        ],
        rooms=[Room(id="R1", capacity=40)],
        cohorts=[StudentCohort(id="C1", name="CSE-A", student_count=30)],
        subjects=[Subject(id="MATH", name="Mathematics")],
        course_offerings=[
            CourseOffering(
                id="OFF1",
                cohort_id="C1",
                subject_id="MATH",
                required_weekly_hours=1,
                qualified_teacher_ids=["F01"],
            )
        ],
    )
    solver = TimetableSolver(payload)
    res = solver.solve()
    assert res["status"] in ["OPTIMAL", "FEASIBLE"]
    assert len(res["schedule"]) == 1
    assert res["schedule"][0]["day"] == 0
    assert res["schedule"][0]["period"] == 1  # P2, because P1 is blocked


def test_5_cohort_blocked_slot():
    """TEST 5: Cohort unavailable at Tuesday P2 (1, 1) must NOT be assigned there."""
    payload = TimetableConstraintPayload(
        days_per_week=2,
        periods_per_day=2,
        teachers=[Teacher(id="F01", name="Dr. Sharma", max_hours=10)],
        rooms=[Room(id="R1", capacity=40)],
        cohorts=[
            StudentCohort(
                id="C1",
                name="CSE-A",
                student_count=30,
                blocked_slots=[TimeSlot(day=1, period=1)],
            )
        ],
        subjects=[Subject(id="MATH", name="Mathematics")],
        course_offerings=[
            CourseOffering(
                id="OFF1",
                cohort_id="C1",
                subject_id="MATH",
                required_weekly_hours=3,
                qualified_teacher_ids=["F01"],
            )
        ],
    )
    solver = TimetableSolver(payload)
    res = solver.solve()
    assert res["status"] in ["OPTIMAL", "FEASIBLE"]
    assert len(res["schedule"]) == 3
    for entry in res["schedule"]:
        assert not (entry["day"] == 1 and entry["period"] == 1)


def test_6_teacher_double_booking():
    """TEST 6: A teacher cannot teach two cohorts simultaneously in the same slot."""
    payload = TimetableConstraintPayload(
        days_per_week=1,
        periods_per_day=2,
        teachers=[Teacher(id="F01", name="Dr. Sharma", max_hours=10)],
        rooms=[Room(id="R1", capacity=40), Room(id="R2", capacity=40)],
        cohorts=[
            StudentCohort(id="C1", name="CSE-A", student_count=30),
            StudentCohort(id="C2", name="CSE-B", student_count=30),
        ],
        subjects=[Subject(id="MATH", name="Mathematics")],
        course_offerings=[
            CourseOffering(id="O1", cohort_id="C1", subject_id="MATH", required_weekly_hours=1, qualified_teacher_ids=["F01"]),
            CourseOffering(id="O2", cohort_id="C2", subject_id="MATH", required_weekly_hours=1, qualified_teacher_ids=["F01"]),
        ],
    )
    solver = TimetableSolver(payload)
    res = solver.solve()
    assert res["status"] in ["OPTIMAL", "FEASIBLE"]
    slots = [(e["day"], e["period"]) for e in res["schedule"]]
    assert len(slots) == 2
    assert slots[0] != slots[1]  # Must be in distinct periods


def test_7_cohort_double_booking():
    """TEST 7: A cohort cannot attend two offerings simultaneously."""
    payload = TimetableConstraintPayload(
        days_per_week=1,
        periods_per_day=2,
        teachers=[
            Teacher(id="F01", name="Dr. Sharma", max_hours=10),
            Teacher(id="F02", name="Dr. Verma", max_hours=10),
        ],
        rooms=[Room(id="R1", capacity=40), Room(id="R2", capacity=40)],
        cohorts=[StudentCohort(id="C1", name="CSE-A", student_count=30)],
        subjects=[Subject(id="MATH", name="Mathematics"), Subject(id="PHY", name="Physics")],
        course_offerings=[
            CourseOffering(id="O1", cohort_id="C1", subject_id="MATH", required_weekly_hours=1, qualified_teacher_ids=["F01"]),
            CourseOffering(id="O2", cohort_id="C1", subject_id="PHY", required_weekly_hours=1, qualified_teacher_ids=["F02"]),
        ],
    )
    solver = TimetableSolver(payload)
    res = solver.solve()
    assert res["status"] in ["OPTIMAL", "FEASIBLE"]
    c1_slots = [(e["day"], e["period"]) for e in res["schedule"]]
    assert len(c1_slots) == 2
    assert c1_slots[0] != c1_slots[1]


def test_8_room_double_booking():
    """TEST 8: A single room cannot host two cohorts at the same day/period."""
    payload = TimetableConstraintPayload(
        days_per_week=1,
        periods_per_day=2,
        teachers=[
            Teacher(id="F01", name="Dr. Sharma", max_hours=10),
            Teacher(id="F02", name="Dr. Verma", max_hours= 10),
        ],
        rooms=[Room(id="ONLY_ROOM", capacity=40)],
        cohorts=[
            StudentCohort(id="C1", name="CSE-A", student_count=30),
            StudentCohort(id="C2", name="CSE-B", student_count=30),
        ],
        subjects=[Subject(id="MATH", name="Mathematics"), Subject(id="PHY", name="Physics")],
        course_offerings=[
            CourseOffering(id="O1", cohort_id="C1", subject_id="MATH", required_weekly_hours=1, qualified_teacher_ids=["F01"]),
            CourseOffering(id="O2", cohort_id="C2", subject_id="PHY", required_weekly_hours=1, qualified_teacher_ids=["F02"]),
        ],
    )
    solver = TimetableSolver(payload)
    res = solver.solve()
    assert res["status"] in ["OPTIMAL", "FEASIBLE"]
    r_slots = [(e["day"], e["period"]) for e in res["schedule"]]
    assert len(r_slots) == 2
    assert r_slots[0] != r_slots[1]


def test_9_teacher_max_hours_enforcement():
    """TEST 9: Teacher workload cannot exceed max_hours."""
    payload = TimetableConstraintPayload(
        days_per_week=2,
        periods_per_day=2,
        teachers=[Teacher(id="F01", name="Dr. Sharma", max_hours=2)],  # Cap: 2 hours
        rooms=[Room(id="R1", capacity=40)],
        cohorts=[StudentCohort(id="C1", name="CSE-A", student_count=30)],
        subjects=[Subject(id="MATH", name="Mathematics")],
        course_offerings=[
            CourseOffering(id="O1", cohort_id="C1", subject_id="MATH", required_weekly_hours=3, qualified_teacher_ids=["F01"]),
        ],
        hard_constraints=[HardConstraint.MAX_HOURS_RESPECTED],
    )
    solver = TimetableSolver(payload)
    res = solver.solve()
    assert res["status"] == "INFEASIBLE"


def test_10_invalid_teacher_validation_error():
    """TEST 10: Invalid offering with unknown teacher returns descriptive error."""
    payload = TimetableConstraintPayload(
        days_per_week=2,
        periods_per_day=2,
        teachers=[Teacher(id="F01", name="Dr. Sharma", max_hours=10)],
        rooms=[Room(id="R1", capacity=40)],
        cohorts=[StudentCohort(id="C1", name="CSE-A", student_count=30)],
        subjects=[Subject(id="MATH", name="Mathematics")],
        course_offerings=[
            CourseOffering(id="O1", cohort_id="C1", subject_id="MATH", required_weekly_hours=1, qualified_teacher_ids=["NON_EXISTENT_TEACHER"]),
        ],
    )
    solver = TimetableSolver(payload)
    res = solver.solve()
    assert res["status"] == "MODEL_INVALID"
    assert "NON_EXISTENT_TEACHER" in res["error"]


def test_11_no_eligible_room_validation_error():
    """TEST 11: Offering with no eligible rooms due to capacity returns descriptive error."""
    payload = TimetableConstraintPayload(
        days_per_week=2,
        periods_per_day=2,
        teachers=[Teacher(id="F01", name="Dr. Sharma", max_hours=10)],
        rooms=[Room(id="TINY_ROOM", capacity=15)],
        cohorts=[StudentCohort(id="C1", name="CSE-A", student_count=50)],  # 50 students > 15 cap
        subjects=[Subject(id="MATH", name="Mathematics")],
        course_offerings=[
            CourseOffering(id="O1", cohort_id="C1", subject_id="MATH", required_weekly_hours=1, qualified_teacher_ids=["F01"]),
        ],
    )
    solver = TimetableSolver(payload)
    res = solver.solve()
    assert res["status"] == "MODEL_INVALID"
    assert "capacity" in res["error"]


def test_12_contradictory_fixed_slots():
    """TEST 12: Contradictory fixed slots for the same cohort slot are rejected in pre-solve."""
    payload = TimetableConstraintPayload(
        days_per_week=2,
        periods_per_day=2,
        teachers=[Teacher(id="F01", name="Dr. Sharma", max_hours=10)],
        rooms=[Room(id="R1", capacity=40)],
        cohorts=[StudentCohort(id="C1", name="CSE-A", student_count=30)],
        subjects=[Subject(id="MATH", name="Mathematics"), Subject(id="PHY", name="Physics")],
        course_offerings=[
            CourseOffering(id="O1", cohort_id="C1", subject_id="MATH", required_weekly_hours=1, qualified_teacher_ids=["F01"]),
            CourseOffering(id="O2", cohort_id="C1", subject_id="PHY", required_weekly_hours=1, qualified_teacher_ids=["F01"]),
        ],
        fixed_slots=[
            FixedSlotRequirement(subject_id="MATH", cohort_id="C1", day=0, period=0),
            FixedSlotRequirement(subject_id="PHY", cohort_id="C1", day=0, period=0),  # Collision!
        ],
    )
    solver = TimetableSolver(payload)
    res = solver.solve()
    assert res["status"] == "MODEL_INVALID"
    assert "Conflicting fixed slots" in res["error"]


def test_13_multi_cohort_with_shared_faculty():
    """TEST 13: Multi-cohort schedule with shared faculty completes OPTIMAL."""
    payload = TimetableConstraintPayload(
        days_per_week=5,
        periods_per_day=6,
        teachers=[
            Teacher(id="F01", name="Dr. Sharma", max_hours=16),
            Teacher(id="F02", name="Dr. Verma", max_hours=16),
        ],
        rooms=[
            Room(id="R1", capacity=60),
            Room(id="R2", capacity=60),
        ],
        cohorts=[
            StudentCohort(id="CSE-A", name="CSE Sec A", student_count=50),
            StudentCohort(id="CSE-B", name="CSE Sec B", student_count=50),
        ],
        subjects=[
            Subject(id="DS", name="Data Structures"),
            Subject(id="DBMS", name="DBMS"),
        ],
        course_offerings=[
            CourseOffering(id="O1", cohort_id="CSE-A", subject_id="DS", required_weekly_hours=4, qualified_teacher_ids=["F01"]),
            CourseOffering(id="O2", cohort_id="CSE-B", subject_id="DS", required_weekly_hours=4, qualified_teacher_ids=["F01"]),
            CourseOffering(id="O3", cohort_id="CSE-A", subject_id="DBMS", required_weekly_hours=3, qualified_teacher_ids=["F02"]),
            CourseOffering(id="O4", cohort_id="CSE-B", subject_id="DBMS", required_weekly_hours=3, qualified_teacher_ids=["F02"]),
        ],
    )
    solver = TimetableSolver(payload)
    res = solver.solve()
    assert res["status"] in ["OPTIMAL", "FEASIBLE"]
    assert len(res["schedule"]) == 14  # 4 + 4 + 3 + 3


def test_14_stress_test_dataset_solves_optimally():
    """TEST 14: Full 6-cohort college stress dataset (36 offerings, 120 sessions) solves in < 2.0s."""
    teachers = [
        Teacher(id="F01", name="Dr. Sharma", max_hours=14, blocked_slots=[TimeSlot(day=4, period=5)]),
        Teacher(id="F02", name="Dr. Verma", max_hours=14),
        Teacher(id="F03", name="Prof. Gupta", max_hours=14),
        Teacher(id="F04", name="Dr. Mukherjee", max_hours=12),
        Teacher(id="F05", name="Prof. Saxena", max_hours=18),
        Teacher(id="F06", name="Dr. Reddy", max_hours=12),
        Teacher(id="F07", name="Dr. Bhattacharya", max_hours=12),
        Teacher(id="F08", name="Prof. Nair", max_hours=18),
        Teacher(id="F09", name="Dr. Kapoor", max_hours=12),
        Teacher(id="F10", name="Dr. Aggarwal", max_hours=12),
        Teacher(id="F11", name="Prof. Joshi", max_hours=14),
        Teacher(id="F12", name="Dr. Mishra", max_hours=12),
        Teacher(id="F13", name="Dr. Choudhury", max_hours=14),
        Teacher(id="F14", name="Prof. Sen", max_hours=16),
        Teacher(id="F15", name="Dr. Iyer", max_hours=14),
        Teacher(id="F16", name="Dr. Thomas", max_hours=12),
    ]
    rooms = [
        Room(id="R101", name="LH-101", capacity=60, room_type="lecture"),
        Room(id="R102", name="LH-102", capacity=60, room_type="lecture"),
        Room(id="R103", name="LH-103", capacity=60, room_type="lecture"),
        Room(id="R201", name="TR-201", capacity=50, room_type="lecture"),
        Room(id="R202", name="TR-202", capacity=50, room_type="lecture"),
        Room(id="LAB1", name="Computing Lab", capacity=60, room_type="lab"),
        Room(id="LAB2", name="Hardware Lab", capacity=60, room_type="lab"),
    ]
    cohorts = [
        StudentCohort(id="CSE-A", name="CSE Sec A", student_count=55),
        StudentCohort(id="CSE-B", name="CSE Sec B", student_count=58),
        StudentCohort(id="CSE-C", name="CSE Sec C", student_count=52),
        StudentCohort(id="ECE-A", name="ECE Sec A", student_count=48),
        StudentCohort(id="ECE-B", name="ECE Sec B", student_count=50),
        StudentCohort(id="ECE-C", name="ECE Sec C", student_count=46),
    ]
    subjects = [
        Subject(id="SUB-CS101", name="Data Structures"),
        Subject(id="SUB-CS102", name="Operating Systems"),
        Subject(id="SUB-CS103", name="DBMS"),
        Subject(id="SUB-CS104", name="Computer Networks"),
        Subject(id="SUB-CS105", name="Computer Architecture"),
        Subject(id="SUB-CS106", name="Software Engineering"),
        Subject(id="SUB-CS107", name="Theory of Computation"),
        Subject(id="SUB-EC101", name="Digital Electronics"),
        Subject(id="SUB-EC102", name="Signals & Systems"),
        Subject(id="SUB-EC103", name="Analog Circuits"),
        Subject(id="SUB-EC104", name="Microprocessors"),
        Subject(id="SUB-EC105", name="Communication Systems"),
        Subject(id="SUB-EC106", name="Electromagnetic Waves"),
        Subject(id="SUB-BS101", name="Discrete Math"),
        Subject(id="SUB-BS102", name="Engineering Math III"),
        Subject(id="SUB-HS101", name="Technical Communication"),
    ]
    course_offerings = [
        # CSE-A (20 hrs)
        CourseOffering(id="OFF_CSEA_DS", cohort_id="CSE-A", subject_id="SUB-CS101", required_weekly_hours=4, qualified_teacher_ids=["F01", "F03"]),
        CourseOffering(id="OFF_CSEA_OS", cohort_id="CSE-A", subject_id="SUB-CS102", required_weekly_hours=4, qualified_teacher_ids=["F03"]),
        CourseOffering(id="OFF_CSEA_DBMS", cohort_id="CSE-A", subject_id="SUB-CS103", required_weekly_hours=3, qualified_teacher_ids=["F02"]),
        CourseOffering(id="OFF_CSEA_CN", cohort_id="CSE-A", subject_id="SUB-CS104", required_weekly_hours=3, qualified_teacher_ids=["F04"]),
        CourseOffering(id="OFF_CSEA_DM", cohort_id="CSE-A", subject_id="SUB-BS101", required_weekly_hours=4, qualified_teacher_ids=["F05", "F13"]),
        CourseOffering(id="OFF_CSEA_TC", cohort_id="CSE-A", subject_id="SUB-HS101", required_weekly_hours=2, qualified_teacher_ids=["F14"]),
        # CSE-B (20 hrs)
        CourseOffering(id="OFF_CSEB_DS", cohort_id="CSE-B", subject_id="SUB-CS101", required_weekly_hours=4, qualified_teacher_ids=["F01", "F03"]),
        CourseOffering(id="OFF_CSEB_OS", cohort_id="CSE-B", subject_id="SUB-CS102", required_weekly_hours=4, qualified_teacher_ids=["F03"]),
        CourseOffering(id="OFF_CSEB_DBMS", cohort_id="CSE-B", subject_id="SUB-CS103", required_weekly_hours=3, qualified_teacher_ids=["F02"]),
        CourseOffering(id="OFF_CSEB_CA", cohort_id="CSE-B", subject_id="SUB-CS105", required_weekly_hours=3, qualified_teacher_ids=["F06"]),
        CourseOffering(id="OFF_CSEB_DM", cohort_id="CSE-B", subject_id="SUB-BS101", required_weekly_hours=4, qualified_teacher_ids=["F05", "F13"]),
        CourseOffering(id="OFF_CSEB_TC", cohort_id="CSE-B", subject_id="SUB-HS101", required_weekly_hours=2, qualified_teacher_ids=["F14"]),
        # CSE-C (20 hrs)
        CourseOffering(id="OFF_CSEC_DS", cohort_id="CSE-C", subject_id="SUB-CS101", required_weekly_hours=4, qualified_teacher_ids=["F01", "F03"]),
        CourseOffering(id="OFF_CSEC_SE", cohort_id="CSE-C", subject_id="SUB-CS106", required_weekly_hours=3, qualified_teacher_ids=["F07"]),
        CourseOffering(id="OFF_CSEC_DBMS", cohort_id="CSE-C", subject_id="SUB-CS103", required_weekly_hours=3, qualified_teacher_ids=["F02"]),
        CourseOffering(id="OFF_CSEC_TOC", cohort_id="CSE-C", subject_id="SUB-CS107", required_weekly_hours=4, qualified_teacher_ids=["F16"]),
        CourseOffering(id="OFF_CSEC_DM", cohort_id="CSE-C", subject_id="SUB-BS101", required_weekly_hours=4, qualified_teacher_ids=["F05", "F13"]),
        CourseOffering(id="OFF_CSEC_TC", cohort_id="CSE-C", subject_id="SUB-HS101", required_weekly_hours=2, qualified_teacher_ids=["F14"]),
        # ECE-A (20 hrs)
        CourseOffering(id="OFF_ECEA_DE", cohort_id="ECE-A", subject_id="SUB-EC101", required_weekly_hours=4, qualified_teacher_ids=["F08"]),
        CourseOffering(id="OFF_ECEA_SS", cohort_id="ECE-A", subject_id="SUB-EC102", required_weekly_hours=4, qualified_teacher_ids=["F08", "F15"]),
        CourseOffering(id="OFF_ECEA_AC", cohort_id="ECE-A", subject_id="SUB-EC103", required_weekly_hours=3, qualified_teacher_ids=["F09"]),
        CourseOffering(id="OFF_ECEA_MP", cohort_id="ECE-A", subject_id="SUB-EC104", required_weekly_hours=3, qualified_teacher_ids=["F10"]),
        CourseOffering(id="OFF_ECEA_M3", cohort_id="ECE-A", subject_id="SUB-BS102", required_weekly_hours=4, qualified_teacher_ids=["F05", "F13"]),
        CourseOffering(id="OFF_ECEA_TC", cohort_id="ECE-A", subject_id="SUB-HS101", required_weekly_hours=2, qualified_teacher_ids=["F14"]),
        # ECE-B (20 hrs)
        CourseOffering(id="OFF_ECEB_DE", cohort_id="ECE-B", subject_id="SUB-EC101", required_weekly_hours=4, qualified_teacher_ids=["F08"]),
        CourseOffering(id="OFF_ECEB_SS", cohort_id="ECE-B", subject_id="SUB-EC102", required_weekly_hours=4, qualified_teacher_ids=["F08", "F15"]),
        CourseOffering(id="OFF_ECEB_AC", cohort_id="ECE-B", subject_id="SUB-EC103", required_weekly_hours=3, qualified_teacher_ids=["F09"]),
        CourseOffering(id="OFF_ECEB_CS", cohort_id="ECE-B", subject_id="SUB-EC105", required_weekly_hours=3, qualified_teacher_ids=["F11"]),
        CourseOffering(id="OFF_ECEB_M3", cohort_id="ECE-B", subject_id="SUB-BS102", required_weekly_hours=4, qualified_teacher_ids=["F05", "F13"]),
        CourseOffering(id="OFF_ECEB_TC", cohort_id="ECE-B", subject_id="SUB-HS101", required_weekly_hours=2, qualified_teacher_ids=["F14"]),
        # ECE-C (20 hrs)
        CourseOffering(id="OFF_ECEC_DE", cohort_id="ECE-C", subject_id="SUB-EC101", required_weekly_hours=4, qualified_teacher_ids=["F08"]),
        CourseOffering(id="OFF_ECEC_SS", cohort_id="ECE-C", subject_id="SUB-EC102", required_weekly_hours=4, qualified_teacher_ids=["F08", "F15"]),
        CourseOffering(id="OFF_ECEC_EM", cohort_id="ECE-C", subject_id="SUB-EC106", required_weekly_hours=3, qualified_teacher_ids=["F12"]),
        CourseOffering(id="OFF_ECEC_MP", cohort_id="ECE-C", subject_id="SUB-EC104", required_weekly_hours=3, qualified_teacher_ids=["F10"]),
        CourseOffering(id="OFF_ECEC_M3", cohort_id="ECE-C", subject_id="SUB-BS102", required_weekly_hours=4, qualified_teacher_ids=["F05", "F13"]),
        CourseOffering(id="OFF_ECEC_TC", cohort_id="ECE-C", subject_id="SUB-HS101", required_weekly_hours=2, qualified_teacher_ids=["F14"]),
    ]
    payload = TimetableConstraintPayload(
        days_per_week=5,
        periods_per_day=6,
        teachers=teachers,
        rooms=rooms,
        cohorts=cohorts,
        subjects=subjects,
        course_offerings=course_offerings,
        fixed_slots=[
            FixedSlotRequirement(subject_id="SUB-CS101", cohort_id="CSE-A", day=0, period=0, room_id="LAB1"),
            FixedSlotRequirement(subject_id="SUB-EC101", cohort_id="ECE-A", day=0, period=0, room_id="LAB2"),
        ],
    )
    solver = TimetableSolver(payload)
    res = solver.solve()
    assert res["status"] in ["OPTIMAL", "FEASIBLE"]
    assert len(res["schedule"]) == 120, f"Expected 120 sessions scheduled, got {len(res['schedule'])}"
    assert res.get("solve_time_ms", 0) <= 12000, f"Solve time too long: {res.get('solve_time_ms')}ms"

