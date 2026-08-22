from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional

class ExtractedField(BaseModel):
    model_config = ConfigDict(extra="ignore")
    key: str
    value: Optional[str] = ""
    confidence: Optional[str] = "High"

class UniversalDocumentSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")
    document_category: Optional[str] = "Uncategorized Document"
    summary: Optional[str] = ""
    extracted_fields: List[ExtractedField] = []
    
    # Specific fields for attendance pipeline
    student_name: Optional[str] = Field(None, description="Full name of the student, if present.")
    student_id: Optional[str] = Field(None, description="Exact student identifier including any prefixes, e.g., 'STU-001'. Do not strip prefixes.")
    leave_start_date: Optional[str] = Field(None, description="Start date of the leave, normalized to YYYY-MM-DD.")
    leave_end_date: Optional[str] = Field(None, description="End date of the leave, normalized to YYYY-MM-DD.")
    leave_type: Optional[str] = Field(None, description="Type of leave (e.g., Sick, Vacation, Personal).")

    requires_human_review: Optional[bool] = False
    student_verified: Optional[bool] = None
    matched_student_class: Optional[str] = None
    status: Optional[str] = "pending_manual_review"
    target_department: Optional[str] = None
    policy_alert: Optional[str] = None

    validations: Optional[dict] = {}
    decision: Optional[str] = None
    decision_reason: Optional[str] = None
