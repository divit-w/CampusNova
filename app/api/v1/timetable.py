import asyncio
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from app.schemas.timetable import TimetableConstraintPayload
from app.services.timetable_solver import TimetableSolver
from app.services.mongo_service import mongo_db
from app.api.v1.deps import require_roles

router = APIRouter()
logger = logging.getLogger(__name__)


async def _run_solver_and_persist(job_id: str, payload: TimetableConstraintPayload) -> None:
    """
    Background task: offload the CPU-bound CP-SAT solver to a thread pool via
    run_in_executor so this coroutine does not block the asyncio event loop.
    Writes the solver result (or error) back to the timetable_jobs collection.
    """
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None, lambda: TimetableSolver(payload).solve()
        )
        status = "completed"
        error = None
    except Exception as exc:
        logger.error(f"Timetable solver error for job {job_id}: {exc}", exc_info=True)
        result = None
        status = "failed"
        error = "Timetable solver encountered an internal error."

    await mongo_db.timetable_jobs_collection.update_one(
        {"job_id": job_id},
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
    background task. Returns 202 Accepted immediately with a job_id so the HTTP
    connection is released before the 10-second solver window begins.

    Poll GET /api/v1/timetable/status/{job_id} for the result.
    """
    job_id = str(uuid.uuid4())

    # Persist initial job state before dispatching the background task.
    # This guarantees the status endpoint can respond even if polled immediately.
    await mongo_db.timetable_jobs_collection.insert_one({
        "job_id": job_id,
        "status": "processing",
        "result": None,
        "error": None,
        "submitted_by": current_user.get("id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
    })

    background_tasks.add_task(_run_solver_and_persist, job_id, payload)

    return {"job_id": job_id, "status": "processing"}


@router.get("/status/{job_id}")
async def get_timetable_status(
    job_id: str,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Polls the status of a previously submitted timetable generation job.

    Possible status values:
    - "processing": solver is still running (poll again)
    - "completed":  result payload is available in the response
    - "failed":     solver raised an unhandled exception; error detail included
    """
    job = await mongo_db.timetable_jobs_collection.find_one(
        {"job_id": job_id}, {"_id": 0}
    )
    if not job:
        raise HTTPException(status_code=404, detail=f"Timetable job '{job_id}' not found.")

    # If completed, surface INFEASIBLE/MODEL_INVALID as 422 — same contract as
    # the old synchronous endpoint, just deferred to the polling call.
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
