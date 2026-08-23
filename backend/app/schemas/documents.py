from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional, Literal, Dict, Any

DOCUMENT_TYPES = Literal[
    "STUDENT_LEAVE_FORM",
    "FACULTY_LEAVE_FORM",
    "MEDICAL_CERTIFICATE",
    "ADMISSION_FORM",
    "STUDENT_ID_DOCUMENT",
    "MARKSHEET",
    "FEE_RECEIPT",
    "FACULTY_DOCUMENT",
    "TIMETABLE",
    "TRANSPORT_DOCUMENT",
    "GENERAL_ADMIN_DOCUMENT",
    "UNKNOWN"
]

class ExtractedField(BaseModel):
    model_config = ConfigDict(extra="ignore")
    key: str
    value: Optional[str] = ""
    confidence: Optional[str] = "High"
    raw_value: Optional[str] = None
    confidence_score: Optional[float] = None
    status: Optional[str] = "valid"

class AffectedTimetableSlot(BaseModel):
    period: str
    time: str
    cohort: str
    subject: str
    room: str
    faculty_id: Optional[str] = None
    faculty_name: Optional[str] = None

class UniversalDocumentSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    # Core Document Intelligence Classification
    document_type: Optional[str] = "UNKNOWN"
    document_category: Optional[str] = "Uncategorized Document"
    classification_confidence: Optional[float] = 0.50
    classification_reason: Optional[str] = None
    requires_human_review: Optional[bool] = False
    
    summary: Optional[str] = ""
    extracted_fields: List[ExtractedField] = []
    
    # Raw OCR & Preprocessing Audit Metadata
    raw_ocr_text: Optional[str] = None
    preprocessing_meta: Optional[Dict[str, Any]] = None
    
    # Student specific entities & fuzzy matching
    student_name: Optional[str] = Field(None, description="Normalized / confirmed full name of the student.")
    student_id: Optional[str] = Field(None, description="Exact student identifier including any prefixes, e.g., 'STU-001'.")
    raw_student_name: Optional[str] = Field(None, description="Exact raw string extracted from OCR for student name.")
    suggested_student_name: Optional[str] = Field(None, description="Fuzzy matched name from tenant directory.")
    student_name_confidence: Optional[float] = Field(None, description="Fuzzy matching confidence score (0.0 - 1.0).")
    student_candidates: Optional[List[Dict[str, Any]]] = Field(default_factory=list, description="Top tenant candidate matches.")
    student_verified: Optional[bool] = None
    matched_student_class: Optional[str] = None
    
    # Leave specific entities (Student / Faculty)
    leave_start_date: Optional[str] = Field(None, description="Start date of the leave, normalized to YYYY-MM-DD.")
    leave_end_date: Optional[str] = Field(None, description="End date of the leave, normalized to YYYY-MM-DD.")
    raw_leave_start_date: Optional[str] = Field(None, description="Raw OCR extracted string for start date.")
    raw_leave_end_date: Optional[str] = Field(None, description="Raw OCR extracted string for end date.")
    leave_start_status: Optional[str] = Field("valid", description="'valid', 'needs_review', 'impossible_date'")
    leave_end_status: Optional[str] = Field("valid", description="'valid', 'needs_review', 'impossible_date', 'invalid_range'")
    leave_start_confidence: Optional[float] = 0.90
    leave_end_confidence: Optional[float] = 0.90
    leave_type: Optional[str] = Field(None, description="Type of leave (e.g., Sick, Personal, Duty).")
    leave_reason: Optional[str] = None
    
    # Faculty specific entities & fuzzy matching
    faculty_name: Optional[str] = None
    faculty_id: Optional[str] = None
    raw_faculty_name: Optional[str] = None
    suggested_faculty_name: Optional[str] = None
    faculty_name_confidence: Optional[float] = None
    faculty_candidates: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    faculty_verified: Optional[bool] = None
    affected_classes: List[AffectedTimetableSlot] = []
    
    # Admission specific entities
    applicant_name: Optional[str] = None
    applicant_program: Optional[str] = None
    applicant_email: Optional[str] = None
    applicant_phone: Optional[str] = None
    parent_name: Optional[str] = None
    application_number: Optional[str] = None
    
    # Fee / Financial specific entities
    receipt_number: Optional[str] = None
    fee_amount: Optional[str] = None
    payment_date: Optional[str] = None
    fee_type: Optional[str] = None
    payment_mode: Optional[str] = None
    transaction_ref: Optional[str] = None
    
    # Academic records specific entities
    semester: Optional[str] = None
    cgpa: Optional[str] = None
    subjects_count: Optional[int] = None
    
    # Operational routing & Recommended Action
    recommended_action: Optional[str] = None
    recommended_action_description: Optional[str] = None
    operational_route: Optional[str] = None
    operational_effect: Optional[Dict[str, Any]] = None
    
    status: Optional[str] = "pending_manual_review"
    target_department: Optional[str] = None
    policy_alert: Optional[str] = None

    validations: Optional[Dict[str, Any]] = {}
    decision: Optional[str] = None
    decision_reason: Optional[str] = None
    
    # Audit trail & human review tracking
    admin_corrections: Optional[Dict[str, Any]] = None
    needs_review_fields: Optional[List[str]] = Field(default_factory=list)
