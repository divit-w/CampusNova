from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

class HardConstraint(str, Enum):
    NO_DOUBLE_BOOKING = "no_double_booking"
    MAX_HOURS_RESPECTED = "max_hours_respected"

class Teacher(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    max_hours: int = Field(gt=0)

class Room(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    capacity: int = Field(gt=0)

class Subject(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    required_weekly_hours: int = Field(gt=0)
    qualified_teachers: List[str] = []

class StudentCohort(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    student_count: int = Field(gt=0)

class FixedSlotRequirement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    subject_id: str
    cohort_id: str
    day: int = Field(ge=0)
    period: int = Field(ge=0)
    room_id: Optional[str] = None

class TimetableConstraintPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    days_per_week: int = Field(gt=0, le=7)
    periods_per_day: int = Field(gt=0, le=24)
    teachers: List[Teacher]
    rooms: List[Room]
    subjects: List[Subject]
    cohorts: List[StudentCohort]
    hard_constraints: List[HardConstraint]
    fixed_slots: List[FixedSlotRequirement] = []
    weight_faculty_gaps: float = 1.0
    weight_subject_spread: float = 2.0
