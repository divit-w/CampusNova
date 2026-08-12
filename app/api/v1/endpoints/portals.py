from typing import List
from fastapi import APIRouter, Depends, HTTPException
from app.api.v1.deps import require_roles
from app.schemas.core_erp import ClassResponse, StudentResponse
from app.services.mongo_service import mongo_db

router = APIRouter()


# ──────────────────────────── Teacher Portal ──────────────────────

@router.get("/teacher/my-classes", response_model=List[ClassResponse])
async def teacher_my_classes(
    current_user: dict = Depends(require_roles(["teacher"])),
):
    """Returns all classes assigned to the authenticated teacher."""
    teacher_id = current_user.get("id")
    cursor = mongo_db.classes_collection.find(
        {"teacher_id": teacher_id}, {"_id": 0}
    )
    return await cursor.to_list(length=200)


# ──────────────────────────── Student Portal ──────────────────────

@router.get("/student/my-schedule", response_model=List[ClassResponse])
async def student_my_schedule(
    current_user: dict = Depends(require_roles(["student"])),
):
    """Returns the class schedule matching the authenticated student's grade+section."""
    student_id = current_user.get("id")

    student_doc = await mongo_db.students_collection.find_one(
        {"student_id": student_id}, {"_id": 0}
    )
    if not student_doc:
        raise HTTPException(status_code=404, detail="Student profile not found")

    grade = student_doc.get("grade")
    section = student_doc.get("section")

    if grade is None or section is None:
        raise HTTPException(
            status_code=400,
            detail="Student profile is incomplete: missing grade or section assignment.",
        )

    cursor = mongo_db.classes_collection.find(
        {"grade": grade, "section": section}, {"_id": 0}
    )
    return await cursor.to_list(length=200)
