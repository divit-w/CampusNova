from typing import List
from fastapi import APIRouter, Depends, HTTPException
from app.api.v1.deps import require_roles
from app.schemas.core_erp import ClassResponse, StudentResponse
from app.schemas.attendance import StudentAttendanceSummaryResponse
from app.services.mongo_service import mongo_db

router = APIRouter()


# ──────────────────────────── Teacher Portal ──────────────────────

@router.get("/teacher/my-classes", response_model=List[ClassResponse])
async def teacher_my_classes(
    current_user: dict = Depends(require_roles(["teacher"])),
):
    """Returns all classes assigned to the authenticated teacher for their tenant."""
    user_email = current_user.get("email")
    univ_id = current_user.get("university_id", "demo-university")
    teacher_doc = await mongo_db.teachers_collection.find_one({"email": user_email, "university_id": univ_id})
    
    if not teacher_doc:
        raise HTTPException(status_code=404, detail="Teacher profile not found for this account.")
        
    teacher_id = teacher_doc.get("teacher_id")
    cursor = mongo_db.classes_collection.find(
        {"teacher_id": teacher_id, "university_id": univ_id}, {"_id": 0}
    )
    return await cursor.to_list(length=200)


# ──────────────────────────── Student Portal ──────────────────────

@router.get("/student/my-schedule", response_model=List[ClassResponse])
async def student_my_schedule(
    current_user: dict = Depends(require_roles(["student"])),
):
    """Returns the class schedule matching the authenticated student's grade+section for their tenant."""
    user_email = current_user.get("email")
    univ_id = current_user.get("university_id", "demo-university")
    student_doc = await mongo_db.students_collection.find_one(
        {"email": user_email, "university_id": univ_id}, {"_id": 0}
    )

    if not student_doc:
        raise HTTPException(status_code=404, detail="Student profile not found for this account.")

    grade = student_doc.get("grade")
    section = student_doc.get("section")

    if grade is None or section is None:
        raise HTTPException(
            status_code=400,
            detail="Student profile is incomplete: missing grade or section assignment.",
        )

    cursor = mongo_db.classes_collection.find(
        {"grade": grade, "section": section, "university_id": univ_id}, {"_id": 0}
    )
    return await cursor.to_list(length=200)


@router.get("/student/attendance-summary", response_model=StudentAttendanceSummaryResponse)
async def student_attendance_summary(
    current_user: dict = Depends(require_roles(["student"])),
):
    """
    Returns the authenticated student's all-time present/absent totals and
    attendance percentage, aggregated directly from student_attendance_collection for their tenant.
    """
    user_email = current_user.get("email")
    univ_id = current_user.get("university_id", "demo-university")
    student_doc = await mongo_db.students_collection.find_one({"email": user_email, "university_id": univ_id})
    
    if not student_doc:
        raise HTTPException(status_code=404, detail="Student profile not found")
        
    student_id = student_doc.get("student_id")

    pipeline = [
        {"$match": {"student_id": student_id, "university_id": univ_id}},
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
    ]

    results = await mongo_db.student_attendance_collection.aggregate(pipeline).to_list(length=1)

    if not results:
        return StudentAttendanceSummaryResponse(
            student_id=student_id, total=0, present=0, absent=0, percentage=0.0
        )

    doc = results[0]
    total = doc.get("total", 0)
    present = doc.get("present", 0)
    absent = doc.get("absent", 0)
    percentage = round((present / total) * 100, 1) if total > 0 else 0.0

    return StudentAttendanceSummaryResponse(
        student_id=student_id, total=total, present=present, absent=absent, percentage=percentage
    )

