from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator

class HardConstraint(str, Enum):
    NO_DOUBLE_BOOKING = "no_double_booking"
    MAX_HOURS_RESPECTED = "max_hours_respected"
    QUALIFIED_FACULTY_ONLY = "qualified_faculty_only"
    ROOM_CAPACITY_RESPECTED = "room_capacity_respected"
    BLOCKED_SLOTS_RESPECTED = "blocked_slots_respected"

class TimeSlot(BaseModel):
    model_config = ConfigDict(extra="ignore")
    day: int = Field(ge=0, le=6)
    period: int = Field(ge=0, le=23)

class Teacher(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    max_hours: int = Field(gt=0)
    blocked_slots: List[TimeSlot] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def handle_legacy_blocked_periods(cls, data):
        if isinstance(data, dict):
            # Support legacy blocked_periods key if present
            if "blocked_slots" not in data and "blocked_periods" in data:
                data["blocked_slots"] = data["blocked_periods"]
        return data

class Room(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: Optional[str] = None
    capacity: int = Field(gt=0)
    room_type: str = "lecture"

class Subject(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    room_type: str = "standard"
    cohort_id: Optional[str] = None
    teacher_id: Optional[str] = None
    required_weekly_hours: Optional[int] = None
    weekly_frequency: Optional[int] = None
    qualified_teachers: List[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def handle_subject_aliases(cls, data):
        if isinstance(data, dict):
            if not data.get("required_weekly_hours") and data.get("weekly_frequency"):
                data["required_weekly_hours"] = data["weekly_frequency"]
            if not data.get("qualified_teachers") and data.get("teacher_id"):
                data["qualified_teachers"] = [data["teacher_id"]]
        return data

class StudentCohort(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    student_count: int = Field(default=30, gt=0)
    blocked_slots: List[TimeSlot] = Field(default_factory=list)

class CourseOffering(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    cohort_id: str
    subject_id: str
    required_weekly_hours: int = Field(gt=0)
    qualified_teacher_ids: List[str] = Field(default_factory=list)
    allowed_room_ids: Optional[List[str]] = None

class FixedSlotRequirement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    offering_id: Optional[str] = None
    subject_id: str
    cohort_id: str
    day: int = Field(ge=0)
    period: int = Field(ge=0)
    room_id: Optional[str] = None

class TimetableConstraintPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    days_per_week: int = Field(gt=0, le=7, default=5)
    periods_per_day: int = Field(gt=0, le=24, default=6)
    teachers: List[Teacher] = Field(default_factory=list)
    rooms: List[Room] = Field(default_factory=list)
    cohorts: List[StudentCohort] = Field(default_factory=list)
    subjects: List[Subject] = Field(default_factory=list)
    course_offerings: List[CourseOffering] = Field(default_factory=list)
    hard_constraints: List[HardConstraint] = Field(
        default_factory=lambda: [HardConstraint.NO_DOUBLE_BOOKING, HardConstraint.MAX_HOURS_RESPECTED]
    )
    fixed_slots: List[FixedSlotRequirement] = Field(default_factory=list)
    weight_faculty_gaps: float = 1.0
    weight_subject_spread: float = 2.0

    @model_validator(mode="before")
    @classmethod
    def handle_working_days(cls, data):
        if isinstance(data, dict):
            if "days_per_week" not in data and "working_days" in data:
                data["days_per_week"] = data["working_days"]
        return data

    @model_validator(mode="after")
    def normalize_course_offerings(self) -> "TimetableConstraintPayload":
        """
        Backward-compatibility layer:
        If course_offerings is empty but legacy subjects and cohorts are provided,
        automatically generate CourseOfferings for each cohort x subject combination.
        """
        if not self.course_offerings and self.subjects and self.cohorts:
            generated: List[CourseOffering] = []
            for cohort in self.cohorts:
                for subject in self.subjects:
                    target_cohort = getattr(subject, "cohort_id", None)
                    if target_cohort and target_cohort != cohort.id:
                        continue
                    hrs = subject.required_weekly_hours if subject.required_weekly_hours and subject.required_weekly_hours > 0 else 3
                    qual = subject.qualified_teachers if subject.qualified_teachers else [t.id for t in self.teachers]
                    generated.append(
                        CourseOffering(
                            id=f"{cohort.id}_{subject.id}",
                            cohort_id=cohort.id,
                            subject_id=subject.id,
                            required_weekly_hours=hrs,
                            qualified_teacher_ids=qual,
                            allowed_room_ids=None,
                        )
                    )
            self.course_offerings = generated
        return self


class ScheduleEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    day: int
    period: int
    teacher_id: str
    cohort_id: str
    room_id: str
    subject_id: str
    offering_id: Optional[str] = None


class ActivateTimetableRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    job_id: Optional[str] = None
    schedule: Optional[List[ScheduleEntry]] = None
    payload: Optional[TimetableConstraintPayload] = None


class ActiveTimetableResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    is_active: bool
    status: str
    job_id: Optional[str] = None
    schedule: List[ScheduleEntry] = Field(default_factory=list)
    payload: Optional[TimetableConstraintPayload] = None
    solve_time_ms: Optional[float] = None
    activated_at: Optional[str] = None
    activated_by: Optional[str] = None
    total_slots_scheduled: int = 0


