from typing import List, Optional
from pydantic import BaseModel, EmailStr, ConfigDict


class StudentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: str
    full_name: str
    grade: str
    section: str
    email: EmailStr


class StudentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    student_id: str
    full_name: str
    grade: str
    section: str
    email: str


class TeacherCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    teacher_id: str
    full_name: str
    subjects: List[str]
    email: EmailStr


class TeacherResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    teacher_id: str
    full_name: str
    subjects: List[str]
    email: str


class ClassCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    class_id: str
    teacher_id: str
    subject: str
    schedule_time: str
    grade: str
    section: str


class ClassResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    class_id: str
    teacher_id: str
    subject: str
    schedule_time: str
    grade: str
    section: str
