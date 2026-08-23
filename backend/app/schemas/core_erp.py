from typing import List, Optional, Any, Dict
from pydantic import BaseModel, ConfigDict, model_validator


# ──────────────────────────── University Settings ────────────────────────────

class UniversitySettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    university_id: str
    university_name: Optional[str] = None
    short_name: Optional[str] = None
    academic_year: Optional[str] = "2026-2027"
    working_days_per_week: int = 5
    periods_per_day: int = 6
    period_duration_minutes: int = 60
    start_time: str = "09:00"
    is_setup_complete: bool = False
    is_demo: bool = False


# ──────────────────────────── Teacher / Faculty ────────────────────────────

class TeacherCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    teacher_id: str
    full_name: str
    email: Optional[str] = ""
    department: Optional[str] = "General"
    subject: Optional[str] = None
    subjects: List[str] = []
    weekly_capacity: Optional[int] = 18
    max_hours: Optional[int] = 18
    status: Optional[str] = "active"
    blocked_slots: Optional[List[str]] = []

    @model_validator(mode="before")
    @classmethod
    def normalize_teacher_input(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "name" in data and not data.get("full_name"):
                data["full_name"] = data["name"]
            if "id" in data and not data.get("teacher_id"):
                data["teacher_id"] = data["id"]
        return data


class TeacherUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    full_name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    subjects: Optional[List[str]] = None
    max_hours: Optional[int] = None
    status: Optional[str] = None
    blocked_slots: Optional[List[str]] = None


class TeacherResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    teacher_id: str
    full_name: str
    name: Optional[str] = None
    email: Optional[str] = ""
    department: Optional[str] = "General"
    subjects: List[str] = []
    max_hours: Optional[int] = 18
    status: Optional[str] = "active"
    blocked_slots: Optional[List[str]] = []


# ──────────────────────────── Student ──────────────────────────────────────

class StudentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: str
    full_name: str
    email: Optional[str] = ""
    grade: Optional[str] = ""
    section: Optional[str] = ""
    cohort_id: Optional[str] = None
    department: Optional[str] = ""
    enrollment_no: Optional[str] = ""
    status: Optional[str] = "active"


class StudentUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    full_name: Optional[str] = None
    email: Optional[str] = None
    grade: Optional[str] = None
    section: Optional[str] = None
    cohort_id: Optional[str] = None
    department: Optional[str] = None
    enrollment_no: Optional[str] = None
    status: Optional[str] = None


class StudentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    student_id: str
    full_name: str
    name: Optional[str] = None
    email: Optional[str] = ""
    grade: Optional[str] = ""
    section: Optional[str] = ""
    cohort_id: Optional[str] = None
    class_id: Optional[str] = None
    department: Optional[str] = ""
    enrollment_no: Optional[str] = ""
    status: Optional[str] = "active"


# ──────────────────────────── Cohort / Class ──────────────────────────────

class ClassCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    class_id: str
    cohort_id: Optional[str] = None
    name: Optional[str] = None
    department: Optional[str] = ""
    grade: Optional[str] = ""
    section: Optional[str] = ""
    capacity: Optional[int] = 40
    teacher_id: Optional[str] = ""
    subject: Optional[str] = ""
    schedule_time: Optional[str] = "09:00 - 15:00"
    status: Optional[str] = "active"


class ClassUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    department: Optional[str] = None
    grade: Optional[str] = None
    section: Optional[str] = None
    capacity: Optional[int] = None
    teacher_id: Optional[str] = None
    subject: Optional[str] = None
    schedule_time: Optional[str] = None
    status: Optional[str] = None


class ClassResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    class_id: str
    cohort_id: Optional[str] = None
    name: Optional[str] = None
    department: Optional[str] = ""
    grade: Optional[str] = ""
    section: Optional[str] = ""
    capacity: Optional[int] = 40
    student_count: Optional[int] = 0
    teacher_id: Optional[str] = ""
    subject: Optional[str] = ""
    schedule_time: Optional[str] = "09:00 - 15:00"
    status: Optional[str] = "active"


# ──────────────────────────── Subject / Course ────────────────────────────

class SubjectCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    subject_id: str
    name: str
    code: Optional[str] = None
    department: Optional[str] = ""
    credits: Optional[int] = 3
    required_weekly_hours: Optional[int] = 3
    weekly_hours: Optional[int] = None
    weekly_sessions: Optional[int] = None
    faculty_id: Optional[str] = None
    teacher_id: Optional[str] = None
    cohort_id: Optional[str] = None
    room_type: Optional[str] = "standard"
    eligible_teachers: Optional[List[str]] = []
    assigned_cohorts: Optional[List[str]] = []
    status: Optional[str] = "active"


class SubjectUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    code: Optional[str] = None
    department: Optional[str] = None
    credits: Optional[int] = None
    required_weekly_hours: Optional[int] = None
    weekly_hours: Optional[int] = None
    faculty_id: Optional[str] = None
    teacher_id: Optional[str] = None
    cohort_id: Optional[str] = None
    room_type: Optional[str] = None
    eligible_teachers: Optional[List[str]] = None
    assigned_cohorts: Optional[List[str]] = None
    status: Optional[str] = None


class SubjectResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    subject_id: str
    id: Optional[str] = None
    name: str
    code: Optional[str] = None
    department: Optional[str] = ""
    credits: Optional[int] = 3
    required_weekly_hours: Optional[int] = 3
    room_type: Optional[str] = "standard"
    eligible_teachers: Optional[List[str]] = []
    assigned_cohorts: Optional[List[str]] = []
    status: Optional[str] = "active"


# ──────────────────────────── Room ────────────────────────────────────────

class RoomCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    room_id: str
    name: Optional[str] = None
    room_type: Optional[str] = "standard"
    type: Optional[str] = None
    capacity: Optional[int] = 40
    status: Optional[str] = "active"
    facilities: Optional[List[str]] = []
    status: Optional[str] = "active"


class RoomUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    room_type: Optional[str] = None
    capacity: Optional[int] = None
    facilities: Optional[List[str]] = None
    status: Optional[str] = None


class RoomResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    room_id: str
    id: Optional[str] = None
    name: Optional[str] = None
    room_type: Optional[str] = "lecture"
    capacity: Optional[int] = 40
    facilities: Optional[List[str]] = []
    status: Optional[str] = "active"
