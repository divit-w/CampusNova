from typing import List, Literal
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

class EdgeAttendancePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: str
    timestamp: datetime
    status: Literal["present", "absent"]
    confidence_score: float = Field(ge=0.0, le=1.0)

class BulkEdgeSyncRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    records: List[EdgeAttendancePayload]


class StudentAttendanceSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    student_id: str
    total: int
    present: int
    absent: int
    percentage: float
