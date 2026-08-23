import asyncio
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from app.schemas.timetable import TimetableConstraintPayload, ActivateTimetableRequest
from app.services.timetable_solver import TimetableSolver
from app.services.mongo_service import mongo_db
from app.api.v1.deps import require_roles

router = APIRouter()
logger = logging.getLogger(__name__)


# ──────────────────────────── Pre-Flight & Entities ────────────────────────────

@router.get("/entities")
async def get_timetable_entities(
    current_user: dict = Depends(require_roles(["admin", "teacher", "student"])),
):
    """
    Returns the tenant's current directory entities (faculty, cohorts, subjects, rooms)
    and academic settings, along with pre-flight generation readiness checks.
    """
    univ_id = current_user["university_id"]

    teachers = await mongo_db.teachers_collection.find(
        {"university_id": univ_id, "status": {"$ne": "deleted"}}, {"_id": 0}
    ).to_list(length=200)

    cohorts = await mongo_db.classes_collection.find(
        {"university_id": univ_id, "status": {"$ne": "deleted"}}, {"_id": 0}
    ).to_list(length=200)

    subjects = await mongo_db.subjects_collection.find(
        {"university_id": univ_id, "status": {"$ne": "deleted"}}, {"_id": 0}
    ).to_list(length=200)

    rooms = await mongo_db.rooms_collection.find(
        {"university_id": univ_id, "status": {"$ne": "deleted"}}, {"_id": 0}
    ).to_list(length=200)

    inst = await mongo_db.institutions_collection.find_one({"university_id": univ_id}, {"_id": 0})
    working_days = inst.get("working_days_per_week", 5) if inst else 5
    periods_per_day = inst.get("periods_per_day", 6) if inst else 6

    missing = []
    if len(teachers) == 0:
        missing.append("Faculty (at least 1 teacher required)")
    if len(cohorts) == 0:
        missing.append("Cohorts / Classes (at least 1 cohort required)")
    if len(subjects) == 0:
        missing.append("Subjects / Courses (at least 1 subject required)")
    if len(rooms) == 0:
        missing.append("Rooms / Facilities (at least 1 room required)")

    return {
        "university_id": univ_id,
        "counts": {
            "teachers": len(teachers),
            "cohorts": len(cohorts),
            "subjects": len(subjects),
            "rooms": len(rooms),
        },
        "teachers": teachers,
        "cohorts": cohorts,
        "subjects": subjects,
        "rooms": rooms,
        "settings": {
            "working_days": working_days,
            "periods_per_day": periods_per_day,
            "academic_year": inst.get("academic_year", "2026-2027") if inst else "2026-2027",
            "start_time": inst.get("start_time", "09:00") if inst else "09:00",
        },
        "ready_to_generate": len(missing) == 0,
        "missing_requirements": missing,
    }


# ──────────────────────────── Solver Generation ────────────────────────────

async def _run_solver_and_persist(job_id: str, payload: TimetableConstraintPayload, university_id: str) -> None:
    """
    Background task: offload the CPU-bound CP-SAT solver to a thread pool via
    run_in_executor so this coroutine does not block the asyncio event loop.
    Writes the solver result (or error) back to the timetable_jobs collection with tenant context.
    """
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None, lambda: TimetableSolver(payload).solve()
        )
        status = "completed"
        error = None

        # Emit an operational alert when solved
        if result and result.get("status") in ("OPTIMAL", "FEASIBLE"):
            schedule_count = len(result.get("schedule", []))
            await mongo_db.alerts_collection.insert_one({
                "alert_id": f"alt_{uuid.uuid4().hex[:10]}",
                "university_id": university_id,
                "type": "timetable_generated",
                "title": "Timetable Draft Generated",
                "message": f"Conflict-free timetable draft with {schedule_count} scheduled sessions is ready for review.",
                "severity": "info",
                "status": "active",
                "route": "/timetable",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    except Exception as exc:
        logger.error(f"Timetable solver error for job {job_id} (tenant {university_id}): {exc}", exc_info=True)
        result = None
        status = "failed"
        error = "Timetable solver encountered an internal error."

    await mongo_db.timetable_jobs_collection.update_one(
        {"job_id": job_id, "university_id": university_id},
        {
            "$set": {
                "status": status,
                "result": result,
                "error": error,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )


@router.post("/generate", status_code=202)
async def generate_timetable(
    payload: TimetableConstraintPayload,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Accepts a timetable constraint payload and dispatches the CP-SAT solver as a
    background task scoped to the active tenant. Returns 202 Accepted immediately.
    """
    job_id = str(uuid.uuid4())
    univ_id = current_user["university_id"]

    # Pre-flight validation: check if payload has required entities
    if not payload.teachers and not payload.cohorts and not payload.rooms:
        # Build payload dynamically from current tenant's database
        teachers_doc = await mongo_db.teachers_collection.find({"university_id": univ_id, "status": {"$ne": "deleted"}}, {"_id": 0}).to_list(length=200)
        classes_doc = await mongo_db.classes_collection.find({"university_id": univ_id, "status": {"$ne": "deleted"}}, {"_id": 0}).to_list(length=200)
        subjects_doc = await mongo_db.subjects_collection.find({"university_id": univ_id, "status": {"$ne": "deleted"}}, {"_id": 0}).to_list(length=200)
        rooms_doc = await mongo_db.rooms_collection.find({"university_id": univ_id, "status": {"$ne": "deleted"}}, {"_id": 0}).to_list(length=200)

        if not teachers_doc or not classes_doc or not subjects_doc or not rooms_doc:
            raise HTTPException(
                status_code=400,
                detail="Your university directory is incomplete. Please add faculty, cohorts, courses, and rooms before generating a timetable."
            )

    # Persist initial job state with tenant context before dispatching background task
    await mongo_db.timetable_jobs_collection.insert_one({
        "job_id": job_id,
        "university_id": univ_id,
        "status": "processing",
        "result": None,
        "error": None,
        "payload": payload.model_dump(),
        "submitted_by": current_user.get("id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
    })

    background_tasks.add_task(_run_solver_and_persist, job_id, payload, univ_id)

    return {"job_id": job_id, "status": "processing"}


@router.get("/status/{job_id}")
async def get_timetable_status(
    job_id: str,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Polls the status of a previously submitted timetable generation job.
    Ensures job belongs strictly to current tenant.
    """
    univ_id = current_user["university_id"]
    job = await mongo_db.timetable_jobs_collection.find_one(
        {"job_id": job_id, "university_id": univ_id}, {"_id": 0}
    )
    if not job:
        raise HTTPException(status_code=404, detail=f"Timetable job '{job_id}' not found.")

    if job.get("status") == "completed" and job.get("result"):
        solver_status = job["result"].get("status", "")
        if solver_status in ("INFEASIBLE", "MODEL_INVALID"):
            raise HTTPException(
                status_code=422,
                detail=f"Timetable unsatisfiable: {solver_status}",
            )

    return {
        "job_id": job_id,
        "status": job.get("status"),
        "result": job.get("result"),
        "error": job.get("error"),
        "created_at": job.get("created_at"),
        "completed_at": job.get("completed_at"),
    }


@router.get("/active")
async def get_active_timetable(
    current_user: dict = Depends(require_roles(["admin", "teacher", "student"])),
):
    """
    Returns the currently active, published university timetable for the caller's tenant.
    """
    univ_id = current_user["university_id"]
    active_doc = await mongo_db.active_timetable_collection.find_one(
        {"is_active": True, "university_id": univ_id}, {"_id": 0}
    )
    if active_doc:
        return active_doc

    # Fallback to latest completed job if marked active for this tenant
    latest_active_job = await mongo_db.timetable_jobs_collection.find_one(
        {"status": "completed", "is_active": True, "university_id": univ_id}, {"_id": 0}, sort=[("completed_at", -1)]
    )
    if latest_active_job and latest_active_job.get("result", {}).get("schedule"):
        return {
            "is_active": True,
            "status": "ACTIVE",
            "job_id": latest_active_job.get("job_id"),
            "schedule": latest_active_job["result"]["schedule"],
            "payload": latest_active_job.get("payload"),
            "solve_time_ms": latest_active_job["result"].get("solve_time_ms"),
            "activated_at": latest_active_job.get("completed_at"),
            "activated_by": latest_active_job.get("submitted_by", "admin"),
            "total_slots_scheduled": len(latest_active_job["result"]["schedule"]),
        }

    return {
        "is_active": False,
        "status": "NO_TIMETABLE",
        "schedule": [],
        "total_slots_scheduled": 0,
    }


@router.post("/activate")
async def activate_timetable(
    req: Optional[ActivateTimetableRequest] = None,
    job_id: Optional[str] = None,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Promotes a solved timetable draft into the active university timetable for the current tenant.
    Emits a persistent operational alert and deactivates prior schedules for this tenant.
    """
    univ_id = current_user["university_id"]
    schedule_data = []
    payload_data = None
    solve_time_ms = None
    target_job_id = (req.job_id if req and req.job_id else None) or job_id

    if target_job_id:
        job = await mongo_db.timetable_jobs_collection.find_one({"job_id": target_job_id, "university_id": univ_id})
        if not job or job.get("status") != "completed" or not job.get("result"):
            raise HTTPException(status_code=400, detail="Cannot activate an incomplete or non-existent solver job.")
        schedule_data = job["result"].get("schedule", [])
        solve_time_ms = job["result"].get("solve_time_ms")
        payload_data = job.get("payload")
    elif req and req.schedule:
        schedule_data = [s.model_dump() for s in req.schedule]
        if req.payload:
            payload_data = req.payload.model_dump()
    else:
        raise HTTPException(status_code=400, detail="Must provide either a valid completed job_id or schedule entries to activate.")

    # Deactivate previous active timetables for THIS tenant only
    await mongo_db.active_timetable_collection.update_many(
        {"is_active": True, "university_id": univ_id},
        {"$set": {"is_active": False}}
    )
    if target_job_id:
        await mongo_db.timetable_jobs_collection.update_many(
            {"is_active": True, "university_id": univ_id},
            {"$set": {"is_active": False}}
        )
        await mongo_db.timetable_jobs_collection.update_one(
            {"job_id": target_job_id, "university_id": univ_id},
            {"$set": {"is_active": True}}
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    active_payload = {
        "is_active": True,
        "status": "ACTIVE",
        "job_id": job_id,
        "university_id": univ_id,
        "schedule": schedule_data,
        "payload": payload_data,
        "solve_time_ms": solve_time_ms,
        "activated_at": now_iso,
        "activated_by": current_user.get("id", "admin"),
        "total_slots_scheduled": len(schedule_data),
    }

    await mongo_db.active_timetable_collection.insert_one(active_payload)
    if "_id" in active_payload:
        del active_payload["_id"]

    # Create persistent operational alert
    await mongo_db.alerts_collection.insert_one({
        "alert_id": f"alt_{uuid.uuid4().hex[:10]}",
        "university_id": univ_id,
        "type": "timetable_activated",
        "title": "Timetable Activated",
        "message": f"University timetable with {len(schedule_data)} classes is now published and active.",
        "severity": "info",
        "status": "active",
        "route": "/timetable",
        "created_at": now_iso,
    })

    return {
        "status": "success",
        "message": f"Timetable activated successfully with {len(schedule_data)} scheduled sessions.",
        "active_timetable": active_payload,
    }


@router.post("/validate")
async def validate_timetable(
    payload: Dict[str, Any],
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Validates a timetable schedule or constraint configuration and detects hard conflicts.
    """
    schedule = payload.get("schedule", [])
    teachers = {t.get("id") or t.get("teacher_id"): t for t in payload.get("teachers", [])}
    rooms = {r.get("id") or r.get("room_id"): r for r in payload.get("rooms", [])}
    cohorts = {c.get("id") or c.get("class_id") or c.get("cohort_id"): c for c in payload.get("cohorts", [])}

    conflicts = []
    
    # 1. Check double bookings
    teacher_slots = {}
    room_slots = {}
    cohort_slots = {}

    for idx, entry in enumerate(schedule):
        d = entry.get("day")
        p = entry.get("period")
        t = entry.get("teacher_id")
        r = entry.get("room_id")
        c = entry.get("cohort_id")

        if d is not None and p is not None:
            # Teacher double booking
            if t:
                key = (t, d, p)
                if key in teacher_slots:
                    conflicts.append({
                        "id": f"conflict-t-{idx}",
                        "type": "teacher_double_booking",
                        "severity": "critical",
                        "day": d,
                        "period": p,
                        "teacher_id": t,
                        "title": f"Faculty Double-Booking ({teachers.get(t, {}).get('name', t)})",
                        "description": f"Faculty {teachers.get(t, {}).get('name', t)} is assigned to multiple classes during Period {p+1} on Day {d+1}."
                    })
                else:
                    teacher_slots[key] = idx

            # Room double booking
            if r:
                key = (r, d, p)
                if key in room_slots:
                    conflicts.append({
                        "id": f"conflict-r-{idx}",
                        "type": "room_double_booking",
                        "severity": "critical",
                        "day": d,
                        "period": p,
                        "room_id": r,
                        "title": f"Room Double-Booking ({rooms.get(r, {}).get('name', r)})",
                        "description": f"Room {rooms.get(r, {}).get('name', r)} is booked for multiple cohorts concurrently during Period {p+1}."
                    })
                else:
                    room_slots[key] = idx

            # Cohort double booking
            if c:
                key = (c, d, p)
                if key in cohort_slots:
                    conflicts.append({
                        "id": f"conflict-c-{idx}",
                        "type": "cohort_double_booking",
                        "severity": "critical",
                        "day": d,
                        "period": p,
                        "cohort_id": c,
                        "title": f"Cohort Double-Booking ({cohorts.get(c, {}).get('name', c)})",
                        "description": f"Cohort {cohorts.get(c, {}).get('name', c)} has multiple simultaneous classes during Period {p+1}."
                    })
                else:
                    cohort_slots[key] = idx

            # Blocked slot violations
            if t in teachers:
                for b in teachers[t].get("blocked_slots", []):
                    if b.get("day") == d and b.get("period") == p:
                        conflicts.append({
                            "id": f"conflict-tb-{idx}",
                            "type": "teacher_blocked",
                            "severity": "critical",
                            "day": d,
                            "period": p,
                            "teacher_id": t,
                            "title": f"Blocked Slot Violation ({teachers[t].get('name', t)})",
                            "description": f"Faculty {teachers[t].get('name', t)} is scheduled during a designated blocked slot."
                        })

    return {
        "is_valid": len(conflicts) == 0,
        "hard_conflicts_count": len(conflicts),
        "conflicts": conflicts
    }
