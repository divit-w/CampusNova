from pydantic import BaseModel, ConfigDict

class ConfidenceScores(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_name: float
    admission_number: float

class DocumentSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_name: str
    admission_number: str
    grade_level: int
    confidence_scores: ConfidenceScores
    requires_review: bool
