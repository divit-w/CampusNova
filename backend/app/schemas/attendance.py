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
    class_section: str
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

# --- Brick 3: Session Attendance & Roster Schemas ---

class SessionStudentItem(BaseModel):
    student_id: str
    status: Literal["present", "absent", "excused", "unmarked"] = "unmarked"

class RecordSessionAttendanceRequest(BaseModel):
    date: str
    cohort_id: str
    subject_id: str
    faculty_id: str
    period: str
    records: List[SessionStudentItem]

class SessionRosterStudent(BaseModel):
    student_id: str
    student_name: str
    roll_number: Optional[str] = None
    email: Optional[str] = None
    status: Literal["present", "absent", "excused", "unmarked"] = "unmarked"
    marked_at: Optional[datetime] = None
    marked_by: Optional[str] = None
    source: Optional[str] = None

class ScheduledSessionInfo(BaseModel):
    period: str
    time_slot: Optional[str] = None
    cohort_id: str
    cohort_name: Optional[str] = None
    subject_id: str
    subject_name: Optional[str] = None
    faculty_id: str
    faculty_name: Optional[str] = None
    room: Optional[str] = None
    is_recorded: bool = False
    recorded_at: Optional[datetime] = None
    total_students: int = 0
    present_count: int = 0
    absent_count: int = 0
    excused_count: int = 0

class SessionRosterResponse(BaseModel):
    date: str
    cohort_id: str
    cohort_name: str
    subject_id: str
    subject_name: str
    faculty_id: str
    faculty_name: str
    period: str
    is_scheduled: bool
    room: Optional[str] = None
    students: List[SessionRosterStudent]
    is_already_recorded: bool = False

class DailySessionStatusResponse(BaseModel):
    date: str
    is_working_day: bool
    status_message: str
    total_scheduled_sessions: int
    recorded_sessions: int
    scheduled_sessions: List[ScheduledSessionInfo]

