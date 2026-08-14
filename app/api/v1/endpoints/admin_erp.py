import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.v1.deps import require_roles

logger = logging.getLogger(__name__)
from app.schemas.core_erp import (
    StudentCreate, StudentResponse,
    TeacherCreate, TeacherResponse,
    ClassCreate, ClassResponse,
)
from app.schemas.dashboard import DashboardSummaryResponse
from app.services.mongo_service import mongo_db

router = APIRouter()


# ──────────────────────────── Students ────────────────────────────

@router.post("/students", response_model=StudentResponse, status_code=201)
async def create_student(
    student_in: StudentCreate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    existing = await mongo_db.students_collection.find_one(
        {"student_id": student_in.student_id}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Student ID already exists")

    doc = student_in.model_dump()
    await mongo_db.students_collection.insert_one(doc)
    return StudentResponse(**doc)


@router.get("/students", response_model=List[StudentResponse])
async def list_students(
    skip: int = Query(0, ge=0, description="Number of records to skip (cursor offset)"),
    limit: int = Query(50, ge=1, le=100, description="Maximum records to return (1–100)"),
    current_user: dict = Depends(require_roles(["admin"])),
):
    cursor = mongo_db.students_collection.find({}, {"_id": 0}).skip(skip).limit(limit)
    return await cursor.to_list(length=limit)


# ──────────────────────────── Teachers ────────────────────────────

@router.post("/teachers", response_model=TeacherResponse, status_code=201)
async def create_teacher(
    teacher_in: TeacherCreate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    existing = await mongo_db.teachers_collection.find_one(
        {"teacher_id": teacher_in.teacher_id}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Teacher ID already exists")

    doc = teacher_in.model_dump()
    await mongo_db.teachers_collection.insert_one(doc)
    return TeacherResponse(**doc)


@router.get("/teachers", response_model=List[TeacherResponse])
async def list_teachers(
    skip: int = Query(0, ge=0, description="Number of records to skip (cursor offset)"),
    limit: int = Query(50, ge=1, le=100, description="Maximum records to return (1–100)"),
    current_user: dict = Depends(require_roles(["admin"])),
):
    cursor = mongo_db.teachers_collection.find({}, {"_id": 0}).skip(skip).limit(limit)
    return await cursor.to_list(length=limit)


# ──────────────────────────── Classes ─────────────────────────────

@router.post("/classes", response_model=ClassResponse, status_code=201)
async def create_class(
    class_in: ClassCreate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    existing = await mongo_db.classes_collection.find_one(
        {"class_id": class_in.class_id}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Class ID already exists")

    doc = class_in.model_dump()
    await mongo_db.classes_collection.insert_one(doc)
    return ClassResponse(**doc)


@router.get("/classes", response_model=List[ClassResponse])
async def list_classes(
    skip: int = Query(0, ge=0, description="Number of records to skip (cursor offset)"),
    limit: int = Query(50, ge=1, le=100, description="Maximum records to return (1–100)"),
    current_user: dict = Depends(require_roles(["admin"])),
):
    cursor = mongo_db.classes_collection.find({}, {"_id": 0}).skip(skip).limit(limit)
    return await cursor.to_list(length=limit)


# ──────────────────── Attendance Analytics ────────────────────────

@router.get("/attendance/summary")
async def attendance_summary(
    date: Optional[str] = Query(
        default=None,
        description="Date in YYYY-MM-DD format. Defaults to today (UTC).",
    ),
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Returns aggregate present/absent counts per student_id for a given date.
    Uses a MongoDB $group aggregation pipeline — avoids loading all records into memory.
    """
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    pipeline = [
        {"$match": {"date": date}},
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
            }
        },
        {"$project": {"_id": 0, "student_id": "$_id", "total": 1, "present": 1, "absent": 1}},
        {"$sort": {"student_id": 1}},
    ]

    results = await mongo_db.student_attendance_collection.aggregate(pipeline).to_list(length=1000)
    return {
        "date": date,
        "total_students": len(results),
        "records": results,
    }


# ──────────────────────────── Dashboard Summary ───────────────────

@router.get("/dashboard-summary", response_model=DashboardSummaryResponse)
async def dashboard_summary(
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Single aggregate call backing the admin dashboard KPI row, weekly trend
    chart, and quick-action live statuses. Every value is read straight from
    existing collections — no derived/mocked fields.
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    active_students = await mongo_db.students_collection.count_documents({})
    active_teachers = await mongo_db.teachers_collection.count_documents({})

    latest_job = await mongo_db.timetable_jobs_collection.find_one(
        {}, {"_id": 0, "status": 1, "created_at": 1, "completed_at": 1}, sort=[("created_at", -1)]
    )
    timetable_status = latest_job.get("status") if latest_job else None
    timetable_generated_at = (
        (latest_job.get("completed_at") or latest_job.get("created_at")) if latest_job else None
    )

    substitutions_today = await mongo_db.substitutions_collection.count_documents({"date": today})

    # Last 7 calendar days, oldest → newest, filling in zero-days that have no records.
    window_start = (datetime.now(timezone.utc) - timedelta(days=6)).strftime("%Y-%m-%d")
    pipeline = [
        {"$match": {"date": {"$gte": window_start, "$lte": today}}},
        {
            "$group": {
                "_id": "$date",
                "total": {"$sum": 1},
                "present": {"$sum": {"$cond": [{"$eq": ["$status", "present"]}, 1, 0]}},
                "absent": {"$sum": {"$cond": [{"$eq": ["$status", "absent"]}, 1, 0]}},
            }
        },
    ]
    rows = await mongo_db.student_attendance_collection.aggregate(pipeline).to_list(length=7)
    by_date = {r["_id"]: r for r in rows}

    weekly_attendance = []
    for i in range(6, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        row = by_date.get(day)
        weekly_attendance.append(
            {
                "date": day,
                "present": row.get("present", 0) if row else 0,
                "absent": row.get("absent", 0) if row else 0,
                "total": row.get("total", 0) if row else 0,
            }
        )

    return DashboardSummaryResponse(
        active_students=active_students,
        active_teachers=active_teachers,
        timetable_status=timetable_status,
        timetable_generated_at=timetable_generated_at,
        substitutions_today=substitutions_today,
        weekly_attendance=weekly_attendance,
    )
