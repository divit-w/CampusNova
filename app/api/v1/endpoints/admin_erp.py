import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.v1.deps import require_roles

logger = logging.getLogger(__name__)
from app.schemas.core_erp import (
    StudentCreate, StudentResponse,
    TeacherCreate, TeacherResponse,
    ClassCreate, ClassResponse,
)
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
