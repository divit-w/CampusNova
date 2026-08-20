from fastapi import APIRouter, HTTPException
from app.schemas.timetable import TimetableConstraintPayload
from app.services.timetable_solver import TimetableSolver

router = APIRouter()

@router.post("/generate")
def generate_timetable(payload: TimetableConstraintPayload):
    try:
        solver = TimetableSolver(payload)
        return solver.solve()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
