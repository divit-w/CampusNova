import asyncio
from fastapi import APIRouter, Depends, HTTPException
from app.schemas.timetable import TimetableConstraintPayload
from app.services.timetable_solver import TimetableSolver
from app.api.v1.deps import require_roles

router = APIRouter()


@router.post("/generate")
async def generate_timetable(
    payload: TimetableConstraintPayload,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Generates a conflict-free timetable using Google OR-Tools CP-SAT.
    The CPU-bound solver is offloaded to a thread pool via run_in_executor
    so the asyncio event loop remains unblocked during solving.
    Returns 422 if the constraint set is unsatisfiable.
    """
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None, lambda: TimetableSolver(payload).solve()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="Timetable solver encountered an internal error")

    if result["status"] in ("INFEASIBLE", "MODEL_INVALID"):
        raise HTTPException(
            status_code=422,
            detail=f"Timetable unsatisfiable: {result['status']}"
        )

    return result
