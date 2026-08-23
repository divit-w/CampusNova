from typing import List, Optional
from pydantic import BaseModel, ConfigDict

class ResourceConflictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    absent_teacher_id: str
    date: str
    time_slot: str
    selected_substitute_id: Optional[str] = None

class SubstituteCandidate(BaseModel):
    teacher_id: str
    full_name: str
    subject: str
    subject_compatibility_score: float
    suitability_score: float
    total_historical_substitutions: int = 0

class ResolveConflictResponse(BaseModel):
    """Response from /resources/resolve-conflict.

    Exposes ML ranking scores so the frontend can render a confidence badge
    (e.g. "95% Match") next to the assigned substitute teacher.
    """
    model_config = ConfigDict(extra="forbid")
    status: str
    substitute_teacher_id: str
    message: str
    subject_compatibility_score: float
    suitability_score: float
    ranked_candidates: List[SubstituteCandidate] = []

class AffectedClassSlot(BaseModel):
    time_slot: str
    period_label: str
    cohort: str
    subject: str
    subject_code: Optional[str] = None
    room: str
    room_capacity: Optional[int] = None
    student_count: Optional[int] = None
    assigned_substitute_id: Optional[str] = None
    assigned_substitute_name: Optional[str] = None

class FacultyScheduleResponse(BaseModel):
    teacher_id: str
    full_name: str
    subject: str
    date: str
    day_name: str
    affected_classes: List[AffectedClassSlot] = []
