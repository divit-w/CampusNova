from typing import List
from fastapi import APIRouter, Depends, HTTPException
from app.api.v1.deps import require_roles
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
    current_user: dict = Depends(require_roles(["admin"])),
):
    cursor = mongo_db.students_collection.find({}, {"_id": 0})
    return await cursor.to_list(length=500)


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
    current_user: dict = Depends(require_roles(["admin"])),
):
    cursor = mongo_db.teachers_collection.find({}, {"_id": 0})
    return await cursor.to_list(length=500)


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
    current_user: dict = Depends(require_roles(["admin"])),
):
    cursor = mongo_db.classes_collection.find({}, {"_id": 0})
    return await cursor.to_list(length=500)
