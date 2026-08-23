import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.schemas.resources import (
    ResourceConflictRequest,
    ResolveConflictResponse,
    SubstituteCandidate,
    AffectedClassSlot,
    FacultyScheduleResponse,
)
from app.api.v1.deps import require_roles
from app.services.mongo_service import mongo_db
from app.api.v1.alerts import alert_manager
from app.services.ml_resource_service import PredictiveAllocator

router = APIRouter()

async def simulate_rag_policy_check():
    return "Policy check passed: Substitute assignment authorized."

PERIOD_TIMES = {
    0: ("P1", "09:00–10:00"),
    1: ("P2", "10:00–11:00"),
    2: ("P3", "11:00–12:00"),
    3: ("P4", "13:00–14:00"),
    4: ("P5", "14:00–15:00"),
    5: ("P6", "15:00–16:00"),
}

# Canonical timetable schedule mapping for fallback/demo consistency (demo-university only)
CANONICAL_TEACHER_SCHEDULES = {
    "F01": [
        {"day": 0, "period": 0, "cohort": "CSE-A", "subject": "SUB-CS101 (Data Structures)", "room": "LH-101 (R101)"},
        {"day": 0, "period": 2, "cohort": "CSE-B", "subject": "SUB-CS101 (Data Structures)", "room": "LH-102 (R102)"},
        {"day": 1, "period": 1, "cohort": "CSE-A", "subject": "SUB-CS101 (Data Structures)", "room": "LH-101 (R101)"},
        {"day": 2, "period": 0, "cohort": "CSE-B", "subject": "SUB-CS101 (Data Structures)", "room": "LH-102 (R102)"},
        {"day": 3, "period": 3, "cohort": "CSE-A", "subject": "SUB-CS101 (Data Structures)", "room": "Computing Lab (LAB1)"},
        {"day": 4, "period": 1, "cohort": "CSE-B", "subject": "SUB-CS101 (Data Structures)", "room": "Computing Lab (LAB1)"},
    ],
    "F02": [
        {"day": 0, "period": 1, "cohort": "CSE-A", "subject": "SUB-CS103 (Database Systems)", "room": "LH-101 (R101)"},
        {"day": 0, "period": 3, "cohort": "CSE-B", "subject": "SUB-CS103 (Database Systems)", "room": "LH-102 (R102)"},
        {"day": 2, "period": 2, "cohort": "CSE-A", "subject": "SUB-CS103 (Database Systems)", "room": "LH-101 (R101)"},
    ],
    "F03": [
        {"day": 0, "period": 3, "cohort": "CSE-A", "subject": "SUB-CS102 (Operating Systems)", "room": "LH-101 (R101)"},
        {"day": 0, "period": 4, "cohort": "CSE-B", "subject": "SUB-CS102 (Operating Systems)", "room": "LH-102 (R102)"},
    ],
    "F04": [
        {"day": 0, "period": 4, "cohort": "CSE-A", "subject": "SUB-CS104 (Computer Networks)", "room": "LH-101 (R101)"},
        {"day": 1, "period": 0, "cohort": "CSE-A", "subject": "SUB-CS104 (Computer Networks)", "room": "LH-101 (R101)"},
    ],
    "F05": [
        {"day": 0, "period": 5, "cohort": "CSE-A", "subject": "SUB-BS101 (Discrete Mathematics)", "room": "LH-101 (R101)"},
        {"day": 0, "period": 1, "cohort": "ECE-A", "subject": "SUB-BS102 (Engineering Math III)", "room": "TR-201 (R201)"},
    ],
    "F08": [
        {"day": 0, "period": 0, "cohort": "ECE-A", "subject": "SUB-EC101 (Digital Electronics)", "room": "Hardware Lab (LAB2)"},
        {"day": 0, "period": 2, "cohort": "ECE-A", "subject": "SUB-EC102 (Signals & Systems)", "room": "TR-201 (R201)"},
    ],
    "F14": [
        {"day": 0, "period": 2, "cohort": "CSE-A", "subject": "SUB-HS101 (Technical Communication)", "room": "LH-101 (R101)"},
        {"day": 0, "period": 5, "cohort": "ECE-A", "subject": "SUB-HS101 (Technical Communication)", "room": "TR-201 (R201)"},
    ],
}


@router.get("/faculty-schedule/{teacher_id}", response_model=FacultyScheduleResponse)
async def get_faculty_schedule(
    teacher_id: str,
    date: str = Query(..., description="Target date YYYY-MM-DD"),
    current_user: dict = Depends(require_roles(["admin", "teacher"]))
):
    """
    Returns the scheduled classes for a faculty member on the given date from
    today's solved timetable, including any existing substitute assignments for this tenant.
    """
    univ_id = current_user["university_id"]
    teacher = await mongo_db.teachers_collection.find_one({
        "$or": [{"teacher_id": teacher_id}, {"id": teacher_id}],
        "university_id": univ_id
    })
    if not teacher:
        raise HTTPException(status_code=404, detail="Faculty member not found")

    tid = teacher.get("teacher_id") or teacher.get("id") or teacher_id
    teacher_name = teacher.get("full_name") or teacher.get("name") or tid
    teacher_subject = teacher.get("subject") or "Engineering"

    try:
        dt = datetime.strptime(date, "%Y-%m-%d")
        day_idx = dt.weekday()  # Monday = 0, Sunday = 6
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        day_name = day_names[day_idx]
    except ValueError:
        day_idx = 0
        day_name = "Monday"

    # 1. Check active published timetable or latest completed solver job for this tenant
    active_timetable = await mongo_db.active_timetable_collection.find_one(
        {"is_active": True, "university_id": univ_id}, {"_id": 0}
    )
    schedule_source = active_timetable.get("schedule", []) if active_timetable else []

    if not schedule_source:
        latest_job = await mongo_db.timetable_jobs_collection.find_one(
            {"status": "completed", "university_id": univ_id},
            sort=[("completed_at", -1)]
        )
        if latest_job and latest_job.get("result") and latest_job["result"].get("schedule"):
            schedule_source = latest_job["result"]["schedule"]

    scheduled_slots = []
    if schedule_source:
        for entry in schedule_source:
            if entry.get("teacher_id") == tid and entry.get("day") == (day_idx % 5):
                period = entry.get("period", 0)
                slot_code, slot_time = PERIOD_TIMES.get(period, (f"P{period+1}", f"Period {period+1}"))
                scheduled_slots.append({
                    "time_slot": slot_code,
                    "period_label": slot_time,
                    "cohort": entry.get("cohort_id", entry.get("cohort", "Cohort")),
                    "subject": entry.get("subject_id", entry.get("subject", teacher_subject)),
                    "room": entry.get("room_id", entry.get("room", "Room")),
                })

    # 2. Canonical demo fallback ONLY for demo-university tenant
    if not scheduled_slots and day_idx < 5 and univ_id == "demo-university":
        canonical_entries = CANONICAL_TEACHER_SCHEDULES.get(tid, [])
        for entry in canonical_entries:
            if entry.get("day") == day_idx:
                period = entry.get("period", 0)
                slot_code, slot_time = PERIOD_TIMES.get(period, (f"P{period+1}", f"Period {period+1}"))
                scheduled_slots.append({
                    "time_slot": slot_code,
                    "period_label": slot_time,
                    "cohort": entry.get("cohort", "CSE-A"),
                    "subject": entry.get("subject", teacher_subject),
                    "room": entry.get("room", "LH-101 (R101)"),
                })

    # Sort slots by period order
    scheduled_slots.sort(key=lambda s: s["time_slot"])

    # 3. Check existing substitutions for this date scoped to tenant
    substitutions = await mongo_db.substitutions_collection.find({
        "absent_teacher_id": tid,
        "date": date,
        "university_id": univ_id
    }).to_list(length=100)

    sub_map = {s.get("time_slot"): s.get("substitute_teacher_id") for s in substitutions}

    affected_classes: List[AffectedClassSlot] = []
    for s in scheduled_slots:
        sub_id = sub_map.get(s["time_slot"])
        sub_name = None
        if sub_id:
            sub_doc = await mongo_db.teachers_collection.find_one({
                "$or": [{"teacher_id": sub_id}, {"id": sub_id}],
                "university_id": univ_id
            })
            sub_name = sub_doc.get("full_name") or sub_doc.get("name") if sub_doc else sub_id

        subj_raw = s["subject"]
        subj_code = None
        if "(" in subj_raw:
            parts = subj_raw.split("(", 1)
            subj_code = parts[0].strip()
            subj_title = parts[1].rstrip(")").strip()
        else:
            subj_title = subj_raw
            subj_code = f"SUB-{subj_raw[:4].upper()}" if len(subj_raw) >= 4 else "SUB"

        cohort_key = s["cohort"]
        room_str = s["room"]

        cohort_doc = await mongo_db.classes_collection.find_one({
            "$or": [{"class_id": cohort_key}, {"cohort_id": cohort_key}],
            "university_id": univ_id
        })
        canonical_sizes = {"CSE-A": 55, "CSE-B": 50, "ECE-A": 48}
        if univ_id == "demo-university" and cohort_key in canonical_sizes:
            student_cnt = canonical_sizes[cohort_key]
        else:
            student_cnt = cohort_doc.get("student_count") or cohort_doc.get("capacity") or 40 if cohort_doc else 40
        room_cap = cohort_doc.get("capacity", 40) if cohort_doc else 40

        affected_classes.append(AffectedClassSlot(
            time_slot=s["time_slot"],
            period_label=s["period_label"],
            cohort=cohort_key,
            subject=subj_title,
            subject_code=subj_code,
            room=room_str,
            room_capacity=room_cap,
            student_count=student_cnt,
            assigned_substitute_id=sub_id,
            assigned_substitute_name=sub_name,
        ))

    return FacultyScheduleResponse(
        teacher_id=tid,
        full_name=teacher_name,
        subject=teacher_subject,
        date=date,
        day_name=day_name,
        affected_classes=affected_classes
    )


@router.get("/available-substitutes", response_model=List[SubstituteCandidate])
async def get_available_substitutes(
    absent_teacher_id: str = Query(..., description="Absent faculty ID"),
    date: str = Query(..., description="Date YYYY-MM-DD"),
    time_slot: str = Query(..., description="Slot e.g. P1"),
    current_user: dict = Depends(require_roles(["admin"]))
):
    univ_id = current_user["university_id"]
    absent_teacher = await mongo_db.teachers_collection.find_one({
        "$or": [{"teacher_id": absent_teacher_id}, {"id": absent_teacher_id}],
        "university_id": univ_id
    })
    if not absent_teacher:
        raise HTTPException(status_code=404, detail="Absent faculty member not found")

    absent_tid = absent_teacher.get("teacher_id") or absent_teacher.get("id") or absent_teacher_id

    # Exclude teachers booked in this slot within caller tenant
    conflicts = await mongo_db.substitutions_collection.find({
        "date": date,
        "time_slot": time_slot,
        "university_id": univ_id
    }).to_list(length=1000)

    busy_teacher_ids = [c.get("substitute_teacher_id", "") for c in conflicts if c.get("substitute_teacher_id")]
    busy_teacher_ids.append(absent_teacher_id)
    if absent_tid:
        busy_teacher_ids.append(absent_tid)

    available_teachers = await mongo_db.teachers_collection.find({
        "university_id": univ_id,
        "status": {"$ne": "deleted"},
        "$and": [
            {"teacher_id": {"$nin": busy_teacher_ids}},
            {"id": {"$nin": busy_teacher_ids}}
        ]
    }).to_list(length=100)

    absent_subject = str(absent_teacher.get("subject", "")).lower()
    for teacher in available_teachers:
        t_sub = str(teacher.get("subject", "")).lower()
        teacher['total_historical_substitutions'] = teacher.get('total_historical_substitutions', 0)
        teacher['historical_leave_probability'] = teacher.get('historical_leave_probability', 0.1)
        if any(term in t_sub and term in absent_subject for term in ["cs", "comp", "data", "net", "elec", "math"]):
            teacher['subject_compatibility_score'] = 0.92
        else:
            teacher['subject_compatibility_score'] = teacher.get('subject_compatibility_score', 0.75)

    ranked_teachers = PredictiveAllocator.rank_substitutes(available_teachers)
    return [
        SubstituteCandidate(
            teacher_id=t.get("teacher_id") or t.get("id", ""),
            full_name=t.get("full_name") or t.get("name", ""),
            subject=t.get("subject", ""),
            subject_compatibility_score=round(float(t.get("subject_compatibility_score", 0.75)), 2),
            suitability_score=round(float(t.get("suitability_score", 1.0)), 2),
            total_historical_substitutions=int(t.get("total_historical_substitutions", 0)),
        )
        for t in ranked_teachers[:5]
    ]


@router.post("/resolve-conflict", response_model=ResolveConflictResponse)
async def resolve_conflict(
    request: ResourceConflictRequest,
    current_user: dict = Depends(require_roles(["admin"]))
):
    await simulate_rag_policy_check()
    univ_id = current_user["university_id"]

    # Check if absent teacher exists within tenant
    absent_teacher = await mongo_db.teachers_collection.find_one({
        "$or": [{"teacher_id": request.absent_teacher_id}, {"id": request.absent_teacher_id}],
        "university_id": univ_id
    })
    if not absent_teacher:
        raise HTTPException(status_code=404, detail="Absent faculty member not found")

    absent_tid = absent_teacher.get("teacher_id") or absent_teacher.get("id") or request.absent_teacher_id

    # Find substitute: any teacher in this tenant not absent, and not already booked in this slot for another absent teacher
    conflicts = await mongo_db.substitutions_collection.find({
        "date": request.date,
        "time_slot": request.time_slot,
        "university_id": univ_id
    }).to_list(length=1000)

    busy_teacher_ids = [
        c.get("substitute_teacher_id", "")
        for c in conflicts
        if c.get("substitute_teacher_id") and c.get("absent_teacher_id") not in (request.absent_teacher_id, absent_tid)
    ]
    busy_teacher_ids.append(request.absent_teacher_id)
    if absent_tid:
        busy_teacher_ids.append(absent_tid)

    available_teachers = await mongo_db.teachers_collection.find({
        "university_id": univ_id,
        "status": {"$ne": "deleted"},
        "$and": [
            {"teacher_id": {"$nin": busy_teacher_ids}},
            {"id": {"$nin": busy_teacher_ids}}
        ]
    }).to_list(length=100)

    if not available_teachers:
        raise HTTPException(status_code=409, detail="No available substitutes found for this time slot")

    # Baseline metrics for ML PredictiveAllocator
    absent_subject = str(absent_teacher.get("subject", "")).lower()
    for teacher in available_teachers:
        t_sub = str(teacher.get("subject", "")).lower()
        teacher['total_historical_substitutions'] = teacher.get('total_historical_substitutions', 0)
        teacher['historical_leave_probability'] = teacher.get('historical_leave_probability', 0.1)
        if any(term in t_sub and term in absent_subject for term in ["cs", "comp", "data", "net", "elec", "math"]):
            teacher['subject_compatibility_score'] = 0.92
        else:
            teacher['subject_compatibility_score'] = teacher.get('subject_compatibility_score', 0.75)

    ranked_teachers = PredictiveAllocator.rank_substitutes(available_teachers)
    
    # Pick substitute (either explicitly requested or top ML-ranked)
    if request.selected_substitute_id:
        selected_matches = [t for t in ranked_teachers if (t.get("teacher_id") == request.selected_substitute_id or t.get("id") == request.selected_substitute_id)]
        substitute = selected_matches[0] if selected_matches else ranked_teachers[0]
    else:
        substitute = ranked_teachers[0]

    substitute_tid = substitute.get("teacher_id") or substitute.get("id")
    if not substitute_tid:
        raise HTTPException(status_code=500, detail="Corrupt teacher record missing teacher_id")

    substitution_record = {
        "absent_teacher_id": absent_tid,
        "substitute_teacher_id": substitute_tid,
        "date": request.date,
        "time_slot": request.time_slot,
        "university_id": univ_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await mongo_db.substitutions_collection.update_one(
        {
            "absent_teacher_id": absent_tid,
            "date": request.date,
            "time_slot": request.time_slot,
            "university_id": univ_id,
        },
        {"$set": substitution_record, "$setOnInsert": {"created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )

    absent_name = absent_teacher.get("full_name") or absent_teacher.get("name") or absent_tid
    substitute_name = substitute.get("full_name") or substitute.get("name") or substitute_tid
    alert_msg = f"Substitute {substitute_name} ({substitute_tid}) assigned for {absent_name} at {request.time_slot} on {request.date}."

    # Save persistent operational alert
    await mongo_db.alerts_collection.insert_one({
        "alert_id": f"alt_{uuid.uuid4().hex[:10]}",
        "university_id": univ_id,
        "type": "substitute_assigned",
        "title": "Substitute Assigned",
        "message": alert_msg,
        "severity": "info",
        "status": "resolved",
        "route": f"/substitute?faculty={absent_tid}&date={request.date}",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    alert_message = {
        "type": "alert",
        "university_id": univ_id,
        "message": alert_msg
    }
    await alert_manager.broadcast(alert_message)

    candidate_schemas = [
        SubstituteCandidate(
            teacher_id=t.get("teacher_id") or t.get("id", ""),
            full_name=t.get("full_name") or t.get("name", ""),
            subject=t.get("subject", ""),
            subject_compatibility_score=round(float(t.get("subject_compatibility_score", 0.75)), 2),
            suitability_score=round(float(t.get("suitability_score", 1.0)), 2),
            total_historical_substitutions=int(t.get("total_historical_substitutions", 0)),
        )
        for t in ranked_teachers[:5]
    ]

    return ResolveConflictResponse(
        status="success",
        substitute_teacher_id=substitute_tid,
        message=alert_msg,
        subject_compatibility_score=round(float(substitute.get("subject_compatibility_score", 0.75)), 2),
        suitability_score=round(float(substitute.get("suitability_score", 1.0)), 2),
        ranked_candidates=candidate_schemas
    )
