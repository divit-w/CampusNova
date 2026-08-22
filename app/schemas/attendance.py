from typing import List, Literal, Optional, Dict
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

class ExtractedAttendanceRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    student_id: str
    name: str = ""
    status: Literal["present", "absent", "on_leave"]

class SyncBulkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    date: str
    records: List[ExtractedAttendanceRecord]

class ValidationResult(BaseModel):
    passed: bool
    code: str
    message: str
    severity: Literal["INFO", "WARNING", "POLICY_FLAG", "CRITICAL"] = "INFO"

class StudentAttendanceRow(BaseModel):
    student_id: Optional[str] = None
    student_name: Optional[str] = None
    status: Optional[str] = None

class BulkAttendanceExtraction(BaseModel):
    date: Optional[str] = None
    class_section: Optional[str] = None
    records: List[StudentAttendanceRow] = []

class ProcessedAttendanceRow(StudentAttendanceRow):
    row_id: str
    validations: Dict[str, ValidationResult] = {}
    decision: Literal["VALID", "REVIEW", "EXCEPTION"]
    decision_reason: Optional[str] = None

class BulkAttendanceResponse(BaseModel):
    batch_id: str
    date: Optional[str] = None
    class_section: Optional[str] = None
    total_rows: int
    valid_rows: int
    review_rows: int
    exception_rows: int
    records: List[ProcessedAttendanceRow]
    overall_decision: Literal["AUTO", "REVIEW", "EXCEPTION"]
    decision_reason: Optional[str] = None

class FinalizeBulkAttendanceRequest(BaseModel):
    batch_id: str
    date: str
    class_section: str
    records: List[ProcessedAttendanceRow]
