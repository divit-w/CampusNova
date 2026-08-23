import logging
import csv
import io
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any, Union
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Body, Request
from pydantic import BaseModel, ConfigDict
from app.api.v1.deps import require_roles

logger = logging.getLogger(__name__)
from app.schemas.core_erp import (
    StudentCreate, StudentUpdate, StudentResponse,
    TeacherCreate, TeacherUpdate, TeacherResponse,
    ClassCreate, ClassUpdate, ClassResponse,
    SubjectCreate, SubjectUpdate, SubjectResponse,
    RoomCreate, RoomUpdate, RoomResponse,
    UniversitySettings,
)
from app.schemas.dashboard import DashboardSummaryResponse
from app.services.mongo_service import mongo_db
from app.core.datetime_utils import (
    get_tenant_now,
    get_tenant_today_str,
    parse_date_to_weekday,
    check_is_working_day
)

router = APIRouter()


class UniversityUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    university_name: Optional[str] = None
    short_name: Optional[str] = None
    academic_year: Optional[str] = None
    working_days_per_week: Optional[int] = None
    periods_per_day: Optional[int] = None
    period_duration_minutes: Optional[int] = None
    start_time: Optional[str] = None
    is_setup_complete: Optional[bool] = None


# ──────────────────────────── University Tenant Management ────────────────────────────

@router.get("/university")
async def get_university_info(
    current_user: dict = Depends(require_roles(["admin", "teacher", "student"])),
):
    univ_id = current_user.get("university_id")
    inst = await mongo_db.institutions_collection.find_one({"university_id": univ_id}, {"_id": 0})
    
    student_count = await mongo_db.students_collection.count_documents({"university_id": univ_id, "status": {"$ne": "deleted"}})
    teacher_count = await mongo_db.teachers_collection.count_documents({"university_id": univ_id, "status": {"$ne": "deleted"}})
    class_count = await mongo_db.classes_collection.count_documents({"university_id": univ_id, "status": {"$ne": "deleted"}})
    subject_count = await mongo_db.subjects_collection.count_documents({"university_id": univ_id, "status": {"$ne": "deleted"}})
    room_count = await mongo_db.rooms_collection.count_documents({"university_id": univ_id, "status": {"$ne": "deleted"}})
    timetable_count = await mongo_db.active_timetable_collection.count_documents({"university_id": univ_id, "is_active": True})

    u_name = (inst.get("university_name") or inst.get("name")) if inst else current_user.get("university_name")
    is_setup = inst.get("is_setup_complete", False) if inst else current_user.get("is_setup_complete", False)

    return {
        "university_id": univ_id,
        "university_name": u_name,
        "name": u_name,
        "short_name": inst.get("short_name") if inst else None,
        "academic_year": inst.get("academic_year", "2026-2027") if inst else "2026-2027",
        "working_days_per_week": inst.get("working_days_per_week", 5) if inst else 5,
        "periods_per_day": inst.get("periods_per_day", 6) if inst else 6,
        "period_duration_minutes": inst.get("period_duration_minutes", 60) if inst else 60,
        "start_time": inst.get("start_time", "09:00") if inst else "09:00",
        "is_setup_complete": is_setup,
        "is_demo": current_user.get("is_demo", False),
        "stats": {
            "students": student_count,
            "teachers": teacher_count,
            "classes": class_count,
            "subjects": subject_count,
            "rooms": room_count,
            "has_active_timetable": timetable_count > 0,
        }
    }


@router.patch("/university")
async def update_university_info(
    payload: UniversityUpdateRequest,
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user.get("university_id")
    raw_name = payload.university_name or payload.name
    update_fields: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if raw_name is not None:
        clean_name = raw_name.strip() if raw_name else None
        update_fields["university_name"] = clean_name
        update_fields["name"] = clean_name
        update_fields["is_setup_complete"] = True
    elif payload.is_setup_complete is not None:
        update_fields["is_setup_complete"] = payload.is_setup_complete

    if payload.short_name is not None:
        update_fields["short_name"] = payload.short_name.strip() if payload.short_name else None
    if payload.academic_year is not None:
        update_fields["academic_year"] = payload.academic_year.strip()
    if payload.working_days_per_week is not None:
        update_fields["working_days_per_week"] = max(1, min(7, payload.working_days_per_week))
    if payload.periods_per_day is not None:
        update_fields["periods_per_day"] = max(1, min(12, payload.periods_per_day))
    if payload.period_duration_minutes is not None:
        update_fields["period_duration_minutes"] = max(15, min(180, payload.period_duration_minutes))
    if payload.start_time is not None:
        update_fields["start_time"] = payload.start_time.strip()

    await mongo_db.institutions_collection.update_one(
        {"university_id": univ_id},
        {"$set": update_fields},
        upsert=True
    )

    if raw_name is not None:
        await mongo_db.users_collection.update_many(
            {"university_id": univ_id},
            {"$set": {
                "university_name": update_fields.get("university_name"),
                "is_setup_complete": True
            }}
        )

    inst = await mongo_db.institutions_collection.find_one({"university_id": univ_id}, {"_id": 0})
    final_name = (inst.get("university_name") or inst.get("name")) if inst else raw_name
    final_setup = inst.get("is_setup_complete", True) if inst else True

    return {
        "status": "success",
        "university_id": univ_id,
        "university_name": final_name,
        "name": final_name,
        "short_name": inst.get("short_name") if inst else None,
        "academic_year": inst.get("academic_year", "2026-2027") if inst else "2026-2027",
        "working_days_per_week": inst.get("working_days_per_week", 5) if inst else 5,
        "periods_per_day": inst.get("periods_per_day", 6) if inst else 6,
        "is_setup_complete": final_setup,
    }


@router.post("/setup/quick-start")
async def quick_start_starter_template(
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Creates an optional miniature starter dataset directly in the authenticated administrator's tenant.
    Never touches demo records globally — everything is stamped with current_user["university_id"].
    """
    univ_id = current_user.get("university_id")
    
    # 1. Starter Faculty
    starter_faculty = [
        {"teacher_id": "T01", "id": "T01", "full_name": "Prof. Alan Turing", "name": "Prof. Alan Turing", "subject": "Computer Science", "subjects": ["Computer Science", "Algorithms"], "email": f"turing@{univ_id}.edu", "department": "Computer Science", "max_hours": 14, "status": "active", "university_id": univ_id},
        {"teacher_id": "T02", "id": "T02", "full_name": "Dr. Ada Lovelace", "name": "Dr. Ada Lovelace", "subject": "Software Engineering", "subjects": ["Software Engineering", "Databases"], "email": f"lovelace@{univ_id}.edu", "department": "Computer Science", "max_hours": 14, "status": "active", "university_id": univ_id},
        {"teacher_id": "T03", "id": "T03", "full_name": "Dr. Claude Shannon", "name": "Dr. Claude Shannon", "subject": "Information Theory", "subjects": ["Information Theory", "Networks"], "email": f"shannon@{univ_id}.edu", "department": "Electrical Engineering", "max_hours": 14, "status": "active", "university_id": univ_id},
        {"teacher_id": "T04", "id": "T04", "full_name": "Prof. Grace Hopper", "name": "Prof. Grace Hopper", "subject": "Systems Programming", "subjects": ["Systems Programming", "Compilers"], "email": f"hopper@{univ_id}.edu", "department": "Computer Science", "max_hours": 14, "status": "active", "university_id": univ_id},
    ]
    for fac in starter_faculty:
        await mongo_db.teachers_collection.update_one(
            {"teacher_id": fac["teacher_id"], "university_id": univ_id},
            {"$set": fac},
            upsert=True
        )

    # 2. Starter Cohorts
    starter_cohorts = [
        {"class_id": "CS-YEAR-1", "cohort_id": "CS-YEAR-1", "name": "CS Year 1 - Cohort A", "student_count": 5, "grade": "1st Year", "section": "A", "department": "Computer Science", "capacity": 40, "room": "ROOM-101", "subject": "Computer Science", "teacher_id": "T01", "schedule_time": "09:00 - 15:00", "status": "active", "university_id": univ_id},
        {"class_id": "CS-YEAR-2", "cohort_id": "CS-YEAR-2", "name": "CS Year 2 - Cohort B", "student_count": 5, "grade": "2nd Year", "section": "B", "department": "Computer Science", "capacity": 40, "room": "ROOM-102", "subject": "Software Engineering", "teacher_id": "T02", "schedule_time": "09:00 - 15:00", "status": "active", "university_id": univ_id},
    ]
    for coh in starter_cohorts:
        await mongo_db.classes_collection.update_one(
            {"class_id": coh["class_id"], "university_id": univ_id},
            {"$set": coh},
            upsert=True
        )

    # 3. Starter Rooms
    starter_rooms = [
        {"id": "ROOM-101", "room_id": "ROOM-101", "name": "Room 101", "capacity": 40, "room_type": "lecture", "facilities": ["Projector", "Audio"], "status": "active", "university_id": univ_id},
        {"id": "ROOM-102", "room_id": "ROOM-102", "name": "Room 102", "capacity": 40, "room_type": "lecture", "facilities": ["Whiteboard"], "status": "active", "university_id": univ_id},
        {"id": "LAB-CS", "room_id": "LAB-CS", "name": "Computing Lab", "capacity": 35, "room_type": "lab", "facilities": ["Computers", "Internet"], "status": "active", "university_id": univ_id},
        {"id": "SEM-201", "room_id": "SEM-201", "name": "Seminar Hall 201", "capacity": 60, "room_type": "seminar", "facilities": ["Tiered Seating", "Projector"], "status": "active", "university_id": univ_id},
    ]
    for rm in starter_rooms:
        await mongo_db.rooms_collection.update_one(
            {"room_id": rm["room_id"], "university_id": univ_id},
            {"$set": rm},
            upsert=True
        )

    # 4. Starter Subjects
    starter_subjects = [
        {"id": "SUB-101", "subject_id": "SUB-101", "name": "Computer Science", "code": "CS101", "department": "Computer Science", "credits": 4, "room_type": "lecture", "required_weekly_hours": 4, "eligible_teachers": ["T01", "T04"], "assigned_cohorts": ["CS-YEAR-1"], "status": "active", "university_id": univ_id},
        {"id": "SUB-102", "subject_id": "SUB-102", "name": "Software Engineering", "code": "CS102", "department": "Computer Science", "credits": 3, "room_type": "lecture", "required_weekly_hours": 3, "eligible_teachers": ["T02"], "assigned_cohorts": ["CS-YEAR-1", "CS-YEAR-2"], "status": "active", "university_id": univ_id},
        {"id": "SUB-103", "subject_id": "SUB-103", "name": "Information Theory", "code": "EC101", "department": "Electrical Engineering", "credits": 3, "room_type": "lecture", "required_weekly_hours": 3, "eligible_teachers": ["T03"], "assigned_cohorts": ["CS-YEAR-2"], "status": "active", "university_id": univ_id},
        {"id": "SUB-104", "subject_id": "SUB-104", "name": "Systems Programming", "code": "CS104", "department": "Computer Science", "credits": 3, "room_type": "lab", "required_weekly_hours": 3, "eligible_teachers": ["T04"], "assigned_cohorts": ["CS-YEAR-2"], "status": "active", "university_id": univ_id},
    ]
    for sub in starter_subjects:
        await mongo_db.subjects_collection.update_one(
            {"subject_id": sub["subject_id"], "university_id": univ_id},
            {"$set": sub},
            upsert=True
        )

    # 5. Starter Students (5 students per cohort = 10 total)
    starter_students = [
        {"student_id": "STU-101", "id": "STU-101", "full_name": "Alice Morgan", "name": "Alice Morgan", "class_id": "CS-YEAR-1", "cohort_id": "CS-YEAR-1", "grade": "1st Year", "section": "A", "department": "Computer Science", "email": f"alice@{univ_id}.edu", "status": "active", "university_id": univ_id},
        {"student_id": "STU-102", "id": "STU-102", "full_name": "Bob Chen", "name": "Bob Chen", "class_id": "CS-YEAR-1", "cohort_id": "CS-YEAR-1", "grade": "1st Year", "section": "A", "department": "Computer Science", "email": f"bob@{univ_id}.edu", "status": "active", "university_id": univ_id},
        {"student_id": "STU-103", "id": "STU-103", "full_name": "Chloe Vance", "name": "Chloe Vance", "class_id": "CS-YEAR-1", "cohort_id": "CS-YEAR-1", "grade": "1st Year", "section": "A", "department": "Computer Science", "email": f"chloe@{univ_id}.edu", "status": "active", "university_id": univ_id},
        {"student_id": "STU-104", "id": "STU-104", "full_name": "David Miller", "name": "David Miller", "class_id": "CS-YEAR-1", "cohort_id": "CS-YEAR-1", "grade": "1st Year", "section": "A", "department": "Computer Science", "email": f"david@{univ_id}.edu", "status": "active", "university_id": univ_id},
        {"student_id": "STU-105", "id": "STU-105", "full_name": "Emma Watson", "name": "Emma Watson", "class_id": "CS-YEAR-1", "cohort_id": "CS-YEAR-1", "grade": "1st Year", "section": "A", "department": "Computer Science", "email": f"emma@{univ_id}.edu", "status": "active", "university_id": univ_id},
        {"student_id": "STU-201", "id": "STU-201", "full_name": "Daniel Kim", "name": "Daniel Kim", "class_id": "CS-YEAR-2", "cohort_id": "CS-YEAR-2", "grade": "2nd Year", "section": "B", "department": "Computer Science", "email": f"daniel@{univ_id}.edu", "status": "active", "university_id": univ_id},
        {"student_id": "STU-202", "id": "STU-202", "full_name": "Elena Rostova", "name": "Elena Rostova", "class_id": "CS-YEAR-2", "cohort_id": "CS-YEAR-2", "grade": "2nd Year", "section": "B", "department": "Computer Science", "email": f"elena@{univ_id}.edu", "status": "active", "university_id": univ_id},
        {"student_id": "STU-203", "id": "STU-203", "full_name": "Farhan Qureshi", "name": "Farhan Qureshi", "class_id": "CS-YEAR-2", "cohort_id": "CS-YEAR-2", "grade": "2nd Year", "section": "B", "department": "Computer Science", "email": f"farhan@{univ_id}.edu", "status": "active", "university_id": univ_id},
        {"student_id": "STU-204", "id": "STU-204", "full_name": "Gina Lin", "name": "Gina Lin", "class_id": "CS-YEAR-2", "cohort_id": "CS-YEAR-2", "grade": "2nd Year", "section": "B", "department": "Computer Science", "email": f"gina@{univ_id}.edu", "status": "active", "university_id": univ_id},
        {"student_id": "STU-205", "id": "STU-205", "full_name": "Harry Osborn", "name": "Harry Osborn", "class_id": "CS-YEAR-2", "cohort_id": "CS-YEAR-2", "grade": "2nd Year", "section": "B", "department": "Computer Science", "email": f"harry@{univ_id}.edu", "status": "active", "university_id": univ_id},
    ]
    for st in starter_students:
        await mongo_db.students_collection.update_one(
            {"student_id": st["student_id"], "university_id": univ_id},
            {"$set": st},
            upsert=True
        )

    # Mark institution setup complete
    await mongo_db.institutions_collection.update_one(
        {"university_id": univ_id},
        {"$set": {"is_setup_complete": True, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )

    return {
        "status": "success",
        "message": f"Starter dataset provisioned for {univ_id}: 4 teachers, 2 cohorts, 10 students, 4 courses, 4 rooms.",
        "counts": {
            "teachers": len(starter_faculty),
            "classes": len(starter_cohorts),
            "students": len(starter_students),
            "subjects": len(starter_subjects),
            "rooms": len(starter_rooms),
        }
    }


# ──────────────────────────── Teachers / Faculty CRUD ────────────────────────────

@router.post("/teachers", response_model=TeacherResponse, status_code=201)
async def create_teacher(
    teacher_in: TeacherCreate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user["university_id"]
    existing = await mongo_db.teachers_collection.find_one(
        {"teacher_id": teacher_in.teacher_id, "university_id": univ_id}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Teacher ID already exists in your university")

    doc = teacher_in.model_dump()
    doc["university_id"] = univ_id
    doc["name"] = doc.get("full_name")
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await mongo_db.teachers_collection.insert_one(doc)
    return TeacherResponse(**doc)


@router.get("/teachers", response_model=List[TeacherResponse])
async def list_teachers(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=200, description="Maximum records to return"),
    current_user: dict = Depends(require_roles(["admin", "teacher", "student"])),
):
    univ_id = current_user["university_id"]
    cursor = mongo_db.teachers_collection.find({"university_id": univ_id, "status": {"$ne": "deleted"}}, {"_id": 0}).skip(skip).limit(limit)
    return await cursor.to_list(length=limit)


@router.put("/teachers/{teacher_id}", response_model=TeacherResponse)
async def update_teacher(
    teacher_id: str,
    teacher_in: TeacherUpdate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user["university_id"]
    existing = await mongo_db.teachers_collection.find_one({"teacher_id": teacher_id, "university_id": univ_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Teacher not found")

    update_data = {k: v for k, v in teacher_in.model_dump().items() if v is not None}
    if "full_name" in update_data:
        update_data["name"] = update_data["full_name"]
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    await mongo_db.teachers_collection.update_one(
        {"teacher_id": teacher_id, "university_id": univ_id},
        {"$set": update_data}
    )
    updated = await mongo_db.teachers_collection.find_one({"teacher_id": teacher_id, "university_id": univ_id}, {"_id": 0})
    return TeacherResponse(**updated)


@router.delete("/teachers/{teacher_id}")
async def delete_teacher(
    teacher_id: str,
    force: bool = Query(False, description="Force deletion even if referenced in timetable"),
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user["university_id"]
    existing = await mongo_db.teachers_collection.find_one({"teacher_id": teacher_id, "university_id": univ_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Teacher not found")

    # Dependency check: Active Timetable
    active_timetable = await mongo_db.active_timetable_collection.find_one({"university_id": univ_id, "is_active": True})
    if active_timetable:
        schedule = active_timetable.get("schedule", [])
        active_slots = [s for s in schedule if s.get("teacher_id") == teacher_id]
        if active_slots and not force:
            return {
                "warning": True,
                "message": f"Teacher {teacher_id} is assigned to {len(active_slots)} active timetable class slots. Deleting will affect active schedules. Pass force=true to confirm or archive teacher.",
                "active_slots_count": len(active_slots)
            }

    await mongo_db.teachers_collection.update_one(
        {"teacher_id": teacher_id, "university_id": univ_id},
        {"$set": {"status": "deleted", "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"status": "success", "message": f"Teacher {teacher_id} successfully archived/deleted."}


# ──────────────────────────── Students CRUD ────────────────────────────

@router.post("/students", response_model=StudentResponse, status_code=201)
async def create_student(
    student_in: StudentCreate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user["university_id"]
    existing = await mongo_db.students_collection.find_one(
        {"student_id": student_in.student_id, "university_id": univ_id}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Student ID already exists in your university")

    doc = student_in.model_dump()
    doc["university_id"] = univ_id
    doc["name"] = doc.get("full_name")
    if doc.get("cohort_id") and not doc.get("class_id"):
        doc["class_id"] = doc["cohort_id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await mongo_db.students_collection.insert_one(doc)
    return StudentResponse(**doc)


@router.get("/students", response_model=List[StudentResponse])
async def list_students(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=500, description="Maximum records to return"),
    cohort: Optional[str] = Query(None, description="Filter by cohort/class ID"),
    current_user: dict = Depends(require_roles(["admin", "teacher"])),
):
    univ_id = current_user["university_id"]
    query = {"university_id": univ_id, "status": {"$ne": "deleted"}}
    if cohort:
        query["$or"] = [{"cohort_id": cohort}, {"class_id": cohort}]
    cursor = mongo_db.students_collection.find(query, {"_id": 0}).skip(skip).limit(limit)
    return await cursor.to_list(length=limit)


@router.put("/students/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: str,
    student_in: StudentUpdate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user["university_id"]
    existing = await mongo_db.students_collection.find_one({"student_id": student_id, "university_id": univ_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Student not found")

    update_data = {k: v for k, v in student_in.model_dump().items() if v is not None}
    if "full_name" in update_data:
        update_data["name"] = update_data["full_name"]
    if "cohort_id" in update_data:
        update_data["class_id"] = update_data["cohort_id"]
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    await mongo_db.students_collection.update_one(
        {"student_id": student_id, "university_id": univ_id},
        {"$set": update_data}
    )
    updated = await mongo_db.students_collection.find_one({"student_id": student_id, "university_id": univ_id}, {"_id": 0})
    return StudentResponse(**updated)


@router.delete("/students/{student_id}")
async def delete_student(
    student_id: str,
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user["university_id"]
    existing = await mongo_db.students_collection.find_one({"student_id": student_id, "university_id": univ_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Student not found")

    await mongo_db.students_collection.update_one(
        {"student_id": student_id, "university_id": univ_id},
        {"$set": {"status": "deleted", "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"status": "success", "message": f"Student {student_id} archived/deleted."}


@router.post("/students/bulk")
async def bulk_import_students(
    request: Request,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Accepts CSV file upload (multipart/form-data) or JSON array payload to bulk create students.
    Strictly validates records and skips duplicates while reporting rows processed.
    """
    univ_id = current_user["university_id"]
    content_type = request.headers.get("content-type", "")
    records_to_insert = []

    if "multipart/form-data" in content_type:
        form = await request.form()
        file = form.get("file")
        if not file:
            raise HTTPException(status_code=400, detail="Missing file in multipart form")
        content = await file.read()
        try:
            csv_text = content.decode("utf-8")
            reader = csv.DictReader(io.StringIO(csv_text))
            for idx, row in enumerate(reader, start=1):
                s_id = row.get("student_id") or row.get("id") or f"STU-{idx:03d}"
                name = row.get("full_name") or row.get("name") or "Student"
                cohort = row.get("cohort_id") or row.get("class_id") or row.get("cohort") or ""
                grade = row.get("grade") or ""
                section = row.get("section") or ""
                email = row.get("email") or f"{s_id.lower()}@{univ_id}.edu"
                
                records_to_insert.append({
                    "student_id": s_id.strip(),
                    "full_name": name.strip(),
                    "name": name.strip(),
                    "cohort_id": cohort.strip() if cohort else None,
                    "class_id": cohort.strip() if cohort else None,
                    "grade": grade.strip(),
                    "section": section.strip(),
                    "email": email.strip(),
                    "status": "active",
                    "university_id": univ_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")
    else:
        try:
            body = await request.json()
            if isinstance(body, dict) and "records" in body:
                body = body["records"]
            if not isinstance(body, list):
                raise ValueError("Payload must be a JSON array of students")
            for item in body:
                s_id = item.get("student_id") or item.get("id")
                name = item.get("full_name") or item.get("name")
                if not s_id or not name:
                    continue
                cohort = item.get("cohort_id") or item.get("class_id")
                records_to_insert.append({
                    "student_id": str(s_id).strip(),
                    "full_name": str(name).strip(),
                    "name": str(name).strip(),
                    "cohort_id": str(cohort).strip() if cohort else None,
                    "class_id": str(cohort).strip() if cohort else None,
                    "grade": str(item.get("grade", "")).strip(),
                    "section": str(item.get("section", "")).strip(),
                    "email": str(item.get("email", "")).strip(),
                    "status": "active",
                    "university_id": univ_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {str(e)}")

    if not records_to_insert:
        raise HTTPException(status_code=400, detail="No valid student records found to import")

    imported = 0
    duplicates = 0
    for doc in records_to_insert:
        existing = await mongo_db.students_collection.find_one({"student_id": doc["student_id"], "university_id": univ_id})
        if existing:
            duplicates += 1
            continue
        await mongo_db.students_collection.insert_one(doc)
        imported += 1

    return {
        "status": "success",
        "imported_count": imported,
        "successful": imported,
        "duplicate_count": duplicates,
        "total_processed": len(records_to_insert),
    }


# ──────────────────────────── Classes / Cohorts CRUD ────────────────────────────

@router.post("/classes", response_model=ClassResponse, status_code=201)
async def create_class(
    class_in: ClassCreate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user["university_id"]
    cid = class_in.class_id or class_in.cohort_id
    existing = await mongo_db.classes_collection.find_one(
        {"class_id": cid, "university_id": univ_id}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Cohort/Class ID already exists in your university")

    doc = class_in.model_dump()
    doc["class_id"] = cid
    doc["cohort_id"] = cid
    doc["university_id"] = univ_id
    doc["name"] = doc.get("name") or cid
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await mongo_db.classes_collection.insert_one(doc)
    return ClassResponse(**doc)


@router.get("/classes", response_model=List[ClassResponse])
async def list_classes(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=200, description="Maximum records to return"),
    current_user: dict = Depends(require_roles(["admin", "teacher", "student"])),
):
    univ_id = current_user["university_id"]
    cursor = mongo_db.classes_collection.find({"university_id": univ_id, "status": {"$ne": "deleted"}}, {"_id": 0}).skip(skip).limit(limit)
    classes = await cursor.to_list(length=limit)
    
    # Calculate real student count per cohort
    for c in classes:
        cid = c.get("class_id") or c.get("cohort_id")
        count = await mongo_db.students_collection.count_documents({
            "university_id": univ_id,
            "status": {"$ne": "deleted"},
            "$or": [{"cohort_id": cid}, {"class_id": cid}]
        })
        c["student_count"] = count
    return classes


@router.put("/classes/{class_id}", response_model=ClassResponse)
async def update_class(
    class_id: str,
    class_in: ClassUpdate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user["university_id"]
    existing = await mongo_db.classes_collection.find_one({"class_id": class_id, "university_id": univ_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Cohort/Class not found")

    update_data = {k: v for k, v in class_in.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    await mongo_db.classes_collection.update_one(
        {"class_id": class_id, "university_id": univ_id},
        {"$set": update_data}
    )
    updated = await mongo_db.classes_collection.find_one({"class_id": class_id, "university_id": univ_id}, {"_id": 0})
    return ClassResponse(**updated)


@router.delete("/classes/{class_id}")
async def delete_class(
    class_id: str,
    force: bool = Query(False, description="Force deletion even if referenced in active timetable"),
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user["university_id"]
    existing = await mongo_db.classes_collection.find_one({"class_id": class_id, "university_id": univ_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Cohort not found")

    # Dependency check: Active Timetable
    active_timetable = await mongo_db.active_timetable_collection.find_one({"university_id": univ_id, "is_active": True})
    if active_timetable:
        schedule = active_timetable.get("schedule", [])
        active_slots = [s for s in schedule if s.get("class_id") == class_id or s.get("cohort_id") == class_id]
        if active_slots and not force:
            return {
                "warning": True,
                "message": f"Cohort {class_id} is assigned to {len(active_slots)} active timetable class slots. Deleting will affect active schedules. Pass force=true to confirm.",
                "active_slots_count": len(active_slots)
            }

    await mongo_db.classes_collection.update_one(
        {"class_id": class_id, "university_id": univ_id},
        {"$set": {"status": "deleted", "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"status": "success", "message": f"Cohort {class_id} archived/deleted."}


# ──────────────────────────── Subjects / Courses CRUD ────────────────────────────

@router.post("/subjects", response_model=SubjectResponse, status_code=201)
async def create_subject(
    subject_in: SubjectCreate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user["university_id"]
    sid = subject_in.subject_id
    existing = await mongo_db.subjects_collection.find_one(
        {"$or": [{"subject_id": sid}, {"id": sid}], "university_id": univ_id}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Subject ID already exists in your university")

    doc = subject_in.model_dump()
    doc["id"] = sid
    doc["subject_id"] = sid
    doc["university_id"] = univ_id
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await mongo_db.subjects_collection.insert_one(doc)
    return SubjectResponse(**doc)


@router.get("/subjects", response_model=List[SubjectResponse])
async def list_subjects(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user: dict = Depends(require_roles(["admin", "teacher", "student"])),
):
    univ_id = current_user["university_id"]
    cursor = mongo_db.subjects_collection.find({"university_id": univ_id, "status": {"$ne": "deleted"}}, {"_id": 0}).skip(skip).limit(limit)
    return await cursor.to_list(length=limit)


@router.put("/subjects/{subject_id}", response_model=SubjectResponse)
async def update_subject(
    subject_id: str,
    subject_in: SubjectUpdate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user["university_id"]
    existing = await mongo_db.subjects_collection.find_one({"$or": [{"subject_id": subject_id}, {"id": subject_id}], "university_id": univ_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Subject not found")

    update_data = {k: v for k, v in subject_in.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    await mongo_db.subjects_collection.update_one(
        {"$or": [{"subject_id": subject_id}, {"id": subject_id}], "university_id": univ_id},
        {"$set": update_data}
    )
    updated = await mongo_db.subjects_collection.find_one({"$or": [{"subject_id": subject_id}, {"id": subject_id}], "university_id": univ_id}, {"_id": 0})
    return SubjectResponse(**updated)


@router.delete("/subjects/{subject_id}")
async def delete_subject(
    subject_id: str,
    force: bool = Query(False, description="Force deletion even if referenced in active timetable"),
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user["university_id"]
    existing = await mongo_db.subjects_collection.find_one({"$or": [{"subject_id": subject_id}, {"id": subject_id}], "university_id": univ_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Dependency check: Active Timetable
    active_timetable = await mongo_db.active_timetable_collection.find_one({"university_id": univ_id, "is_active": True})
    if active_timetable:
        schedule = active_timetable.get("schedule", [])
        active_slots = [s for s in schedule if s.get("subject_id") == subject_id]
        if active_slots and not force:
            return {
                "warning": True,
                "message": f"Subject {subject_id} is assigned to {len(active_slots)} active timetable class slots. Pass force=true to confirm.",
                "active_slots_count": len(active_slots)
            }

    await mongo_db.subjects_collection.update_one(
        {"$or": [{"subject_id": subject_id}, {"id": subject_id}], "university_id": univ_id},
        {"$set": {"status": "deleted", "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"status": "success", "message": f"Subject {subject_id} archived/deleted."}


# ──────────────────────────── Rooms CRUD ────────────────────────────

@router.post("/rooms", response_model=RoomResponse, status_code=201)
async def create_room(
    room_in: RoomCreate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user["university_id"]
    rid = room_in.room_id
    existing = await mongo_db.rooms_collection.find_one(
        {"$or": [{"room_id": rid}, {"id": rid}], "university_id": univ_id}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Room ID already exists in your university")

    doc = room_in.model_dump()
    doc["id"] = rid
    doc["room_id"] = rid
    doc["name"] = doc.get("name") or rid
    doc["university_id"] = univ_id
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await mongo_db.rooms_collection.insert_one(doc)
    return RoomResponse(**doc)


@router.get("/rooms", response_model=List[RoomResponse])
async def list_rooms(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user: dict = Depends(require_roles(["admin", "teacher", "student"])),
):
    univ_id = current_user["university_id"]
    cursor = mongo_db.rooms_collection.find({"university_id": univ_id, "status": {"$ne": "deleted"}}, {"_id": 0}).skip(skip).limit(limit)
    return await cursor.to_list(length=limit)


@router.put("/rooms/{room_id}", response_model=RoomResponse)
async def update_room(
    room_id: str,
    room_in: RoomUpdate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user["university_id"]
    existing = await mongo_db.rooms_collection.find_one({"$or": [{"room_id": room_id}, {"id": room_id}], "university_id": univ_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Room not found")

    update_data = {k: v for k, v in room_in.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    await mongo_db.rooms_collection.update_one(
        {"$or": [{"room_id": room_id}, {"id": room_id}], "university_id": univ_id},
        {"$set": update_data}
    )
    updated = await mongo_db.rooms_collection.find_one({"$or": [{"room_id": room_id}, {"id": room_id}], "university_id": univ_id}, {"_id": 0})
    return RoomResponse(**updated)


@router.delete("/rooms/{room_id}")
async def delete_room(
    room_id: str,
    force: bool = Query(False, description="Force deletion even if referenced in active timetable"),
    current_user: dict = Depends(require_roles(["admin"])),
):
    univ_id = current_user["university_id"]
    existing = await mongo_db.rooms_collection.find_one({"$or": [{"room_id": room_id}, {"id": room_id}], "university_id": univ_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Room not found")

    # Dependency check: Active Timetable
    active_timetable = await mongo_db.active_timetable_collection.find_one({"university_id": univ_id, "is_active": True})
    if active_timetable:
        schedule = active_timetable.get("schedule", [])
        active_slots = [s for s in schedule if s.get("room_id") == room_id or s.get("room") == room_id]
        if active_slots and not force:
            return {
                "warning": True,
                "message": f"Room {room_id} is assigned to {len(active_slots)} active timetable class slots. Pass force=true to confirm.",
                "active_slots_count": len(active_slots)
            }

    await mongo_db.rooms_collection.update_one(
        {"$or": [{"room_id": room_id}, {"id": room_id}], "university_id": univ_id},
        {"$set": {"status": "deleted", "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"status": "success", "message": f"Room {room_id} archived/deleted."}


# ──────────────────── Attendance Analytics ────────────────────────

@router.get("/attendance/summary")
async def attendance_summary(
    date: str = Query(
        None,
        description="Optional date in YYYY-MM-DD format. Defaults to today's local date based on tz_offset_minutes.",
    ),
    tz_offset_minutes: int = Query(0, description="Client timezone offset from UTC in minutes (UTC - Local)."),
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Returns aggregate present/absent/excused counts per student_id for a given date scoped to tenant.
    Uses a MongoDB $group aggregation pipeline — avoids loading all records into memory.
    """
    univ_id = current_user["university_id"]
    if not date:
        date = get_tenant_today_str(tz_offset_minutes)

    inst = await mongo_db.institutions_collection.find_one({"university_id": univ_id}, {"_id": 0})
    working_days = inst.get("working_days_per_week", 5) if inst else 5
    is_working_day = check_is_working_day(date, working_days)

    pipeline = [
        {"$match": {"date": date, "university_id": univ_id}},
        {
            "$group": {
                "_id": "$student_id",
                "total": {"$sum": 1},
                "present": {
                    "$sum": {"$cond": [{"$eq": ["$status", "present"]}, 1, 0]}
                },
                "absent": {
                    "$sum": {"$cond": [{"$eq": ["$status", "absent"]}, 1, 0]}
                },
                "excused": {
                    "$sum": {"$cond": [{"$in": ["$status", ["excused", "leave"]]}, 1, 0]}
                },
                "leave": {
                    "$sum": {"$cond": [{"$eq": ["$status", "leave"]}, 1, 0]}
                },
            }
        },
        {"$project": {"_id": 0, "student_id": "$_id", "total": 1, "present": 1, "absent": 1, "excused": 1, "leave": 1}},
        {"$sort": {"student_id": 1}},
    ]

    results = await mongo_db.student_attendance_collection.aggregate(pipeline).to_list(length=1000)
    
    total_roster = await mongo_db.students_collection.count_documents({
        "university_id": univ_id,
        "status": {"$ne": "deleted"}
    })

    total_present = sum(r.get("present", 0) for r in results)
    total_absent = sum(r.get("absent", 0) for r in results)
    total_excused = sum(r.get("excused", 0) for r in results)
    total_unmarked = max(0, total_roster - len(results)) if is_working_day else 0

    return {
        "date": date,
        "is_working_day": is_working_day,
        "total_students": len(results),
        "roster_total": total_roster,
        "present": total_present,
        "absent": total_absent,
        "excused": total_excused,
        "unmarked": total_unmarked,
        "records": results,
    }


# ──────────────────────────── Dashboard Summary ───────────────────

@router.get("/dashboard-summary", response_model=DashboardSummaryResponse)
async def dashboard_summary(
    tz_offset_minutes: int = Query(0, description="Client timezone offset from UTC in minutes (UTC - Local)."),
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Single aggregate call backing the admin dashboard KPI row, weekly trend
    chart, and quick-action live statuses. Every value is read straight from
    the tenant's own collections — no derived/mocked/fallback fields.
    """
    univ_id = current_user["university_id"]
    client_now = get_tenant_now(tz_offset_minutes)
    today = client_now.strftime("%Y-%m-%d")

    active_students = await mongo_db.students_collection.count_documents({"university_id": univ_id, "status": {"$ne": "deleted"}})
    active_teachers = await mongo_db.teachers_collection.count_documents({"university_id": univ_id, "status": {"$ne": "deleted"}})

    # Working day check
    inst = await mongo_db.institutions_collection.find_one({"university_id": univ_id}, {"_id": 0})
    working_days = inst.get("working_days_per_week", 5) if inst else 5
    is_working_day = check_is_working_day(today, working_days)

    active_timetable_doc = await mongo_db.active_timetable_collection.find_one(
        {"is_active": True, "university_id": univ_id}, {"_id": 0}
    )
    if active_timetable_doc:
        timetable_status = "active"
        timetable_generated_at = active_timetable_doc.get("activated_at")
    else:
        latest_job = await mongo_db.timetable_jobs_collection.find_one(
            {"university_id": univ_id}, {"_id": 0, "status": 1, "created_at": 1, "completed_at": 1}, sort=[("created_at", -1)]
        )
        if latest_job:
            if latest_job.get("status") == "processing":
                timetable_status = "processing"
                timetable_generated_at = latest_job.get("created_at")
            elif latest_job.get("status") == "completed":
                timetable_status = "completed"
                timetable_generated_at = latest_job.get("completed_at")
            else:
                timetable_status = latest_job.get("status")
                timetable_generated_at = latest_job.get("created_at")
        else:
            timetable_status = None
            timetable_generated_at = None

    substitutions_today = await mongo_db.substitutions_collection.count_documents({"date": today, "university_id": univ_id})

    # Today's attendance KPIs
    today_records = await mongo_db.student_attendance_collection.find({"date": today, "university_id": univ_id}).to_list(length=1000)
    present_today = sum(1 for r in today_records if r.get("status") == "present")
    absent_today = sum(1 for r in today_records if r.get("status") == "absent")
    excused_today = sum(1 for r in today_records if r.get("status") in ["excused", "leave"])
    
    unique_marked_students = len({r.get("student_id") for r in today_records if r.get("student_id")})
    unmarked_today = max(0, active_students - unique_marked_students) if is_working_day else 0

    # Status message
    if not is_working_day:
        att_status_msg = "No academic sessions scheduled today."
    elif len(today_records) == 0:
        att_status_msg = "Attendance not completed for today's scheduled classes."
    else:
        att_status_msg = f"{present_today} students present today."

    # Last 7 calendar days, oldest → newest, filling in zero-days that have no records.
    window_start = (client_now - timedelta(days=6)).strftime("%Y-%m-%d")
    pipeline = [
        {"$match": {"date": {"$gte": window_start, "$lte": today}, "university_id": univ_id}},
        {
            "$group": {
                "_id": "$date",
                "total": {"$sum": 1},
                "present": {"$sum": {"$cond": [{"$eq": ["$status", "present"]}, 1, 0]}},
                "absent": {"$sum": {"$cond": [{"$eq": ["$status", "absent"]}, 1, 0]}},
                "excused": {"$sum": {"$cond": [{"$in": ["$status", ["excused", "leave"]]}, 1, 0]}},
            }
        },
    ]
    rows = await mongo_db.student_attendance_collection.aggregate(pipeline).to_list(length=7)
    by_date = {r["_id"]: r for r in rows}

    weekly_attendance = []
    for i in range(6, -1, -1):
        day = (client_now - timedelta(days=i)).strftime("%Y-%m-%d")
        row = by_date.get(day)
        weekly_attendance.append(
            {
                "date": day,
                "present": row.get("present", 0) if row else 0,
                "absent": row.get("absent", 0) if row else 0,
                "excused": row.get("excused", 0) if row else 0,
                "total": row.get("total", 0) if row else 0,
            }
        )

    return DashboardSummaryResponse(
        active_students=active_students,
        active_teachers=active_teachers,
        present_today=present_today,
        absent_today=absent_today,
        excused_today=excused_today,
        unmarked_today=unmarked_today,
        is_working_day=is_working_day,
        attendance_status_message=att_status_msg,
        timetable_status=timetable_status,
        timetable_generated_at=timetable_generated_at,
        substitutions_today=substitutions_today,
        weekly_attendance=weekly_attendance,
    )
