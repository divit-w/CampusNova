from enum import Enum
from typing import List
from pydantic import BaseModel, ConfigDict, Field

class HardConstraint(str, Enum):
    NO_DOUBLE_BOOKING = "no_double_booking"
    MAX_HOURS_RESPECTED = "max_hours_respected"

class Teacher(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    max_hours: int = Field(gt=0)

class Room(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    capacity: int = Field(gt=0)

class Subject(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    required_weekly_hours: int = Field(gt=0)

class TimetableConstraintPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    days_per_week: int = Field(gt=0, le=7)
    periods_per_day: int = Field(gt=0, le=24)
    teachers: List[Teacher]
    rooms: List[Room]
    subjects: List[Subject]
    hard_constraints: List[HardConstraint]
