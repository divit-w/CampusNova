from pydantic import BaseModel, ConfigDict

class ResourceConflictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    absent_teacher_id: str
    date: str
    time_slot: str

class ResolveConflictResponse(BaseModel):
    """Response from /resources/resolve-conflict.

    Exposes ML ranking scores so the frontend can render a confidence badge
    (e.g. "95% Match") next to the assigned substitute teacher.
    """
    model_config = ConfigDict(extra="forbid")
    status: str
    substitute_teacher_id: str
    message: str
    # ML transparency fields — sourced directly from PredictiveAllocator output.
    subject_compatibility_score: float
    suitability_score: float
