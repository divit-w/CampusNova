from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class DailyAttendancePoint(BaseModel):
    model_config = ConfigDict(extra="ignore")
    date: str
    present: int
    absent: int
    total: int


class DashboardSummaryResponse(BaseModel):
    """
    Aggregate snapshot for the admin dashboard — every field is derived from
    existing collections (students, teachers, timetable_jobs, substitutions,
    student_attendance). No synthetic or placeholder data.
    """

    model_config = ConfigDict(extra="ignore")

    active_students: int
    active_teachers: int

    # Most recent timetable_jobs_collection document, if any has ever been submitted.
    timetable_status: Optional[str] = None  # "processing" | "completed" | "failed"
    timetable_generated_at: Optional[str] = None

    # substitutions_collection rows recorded for today's date (server UTC).
    substitutions_today: int

    # Last 7 calendar days (oldest → newest) of student_attendance_collection totals.
    weekly_attendance: List[DailyAttendancePoint]
