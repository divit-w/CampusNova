from pydantic import BaseModel, ConfigDict

class ResourceConflictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    absent_teacher_id: str
    date: str
    time_slot: str
