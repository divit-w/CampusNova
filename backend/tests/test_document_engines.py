import pytest
from datetime import datetime, timedelta
from app.schemas.documents import UniversalDocumentSchema, ExtractedField
from app.services.validation_engine import LeaveApplicationValidator
from app.services.decision_engine import route_document

class MockMongoCollection:
    def __init__(self, data):
        self.data = data
        
    async def find_one(self, query):
        for item in self.data:
            match = True
            for k, v in query.items():
                if k == "full_name" and isinstance(v, dict) and "$regex" in v:
                    import re
                    if not re.match(v["$regex"], item.get("full_name", ""), re.IGNORECASE):
                        match = False
                        break
                elif item.get(k) != v:
                    if isinstance(v, dict) and "$in" in v:
                        if item.get(k) not in v["$in"]:
                            match = False
                            break
                    elif isinstance(v, dict) and "$gte" in v:
                        # minimal mock logic
                        pass
                    else:
                        match = False
                        break
            if match:
                return item
        return None

# Mocks
mock_students = [
    {"student_id": "S101", "full_name": "Meera Gupta"},
    {"student_id": "12", "full_name": "John Doe"},
    {"student_id": "STU-001", "full_name": "Aarav Patel"}
]

mock_attendance = [
    # Mock an existing leave
    {"student_id": "12", "date": "2025-04-19", "status": "excused"}
]

@pytest.fixture
def mock_db(monkeypatch):
    import app.services.validation_engine as ve
    class MockDB:
        students_collection = MockMongoCollection(mock_students)
        student_attendance_collection = MockMongoCollection(mock_attendance)
    
    monkeypatch.setattr(ve, "mongo_db", MockDB())

@pytest.mark.asyncio
async def test_case_1_valid_leave_auto(mock_db):
    doc = UniversalDocumentSchema(
        student_id="S101",
        leave_start_date="2025-05-01",
        leave_end_date="2025-05-02",
        extracted_fields=[ExtractedField(key="Reason", value="Sick", confidence="High")]
    )
    validator = LeaveApplicationValidator(doc)
    results = await validator.validate()
    
    assert results["identity"]["passed"] is True
    assert results["temporal"]["passed"] is True
    assert results["conflict"]["passed"] is True
    assert results["policy"]["passed"] is True
    
    decision, reason = route_document(doc, results)
    assert decision == "AUTO"

@pytest.mark.asyncio
async def test_case_2_student_not_found(mock_db):
    doc = UniversalDocumentSchema(
        student_id="999",
        leave_start_date="2025-05-01",
        leave_end_date="2025-05-02",
        extracted_fields=[ExtractedField(key="Reason", value="Sick", confidence="High")]
    )
    validator = LeaveApplicationValidator(doc)
    results = await validator.validate()
    
    assert results["identity"]["passed"] is False
    
    decision, reason = route_document(doc, results)
    assert decision == "EXCEPTION"

@pytest.mark.asyncio
async def test_case_3_impossible_dates(mock_db):
    doc = UniversalDocumentSchema(
        student_id="S101",
        leave_start_date="2025-05-05",
        leave_end_date="2025-05-01",
        extracted_fields=[ExtractedField(key="Reason", value="Sick", confidence="High")]
    )
    validator = LeaveApplicationValidator(doc)
    results = await validator.validate()
    
    assert results["temporal"]["passed"] is False
    
    decision, reason = route_document(doc, results)
    assert decision == "EXCEPTION"

@pytest.mark.asyncio
async def test_case_4_long_leave(mock_db):
    doc = UniversalDocumentSchema(
        student_id="S101",
        leave_start_date="2025-05-01",
        leave_end_date="2025-05-10",
        extracted_fields=[ExtractedField(key="Reason", value="Sick", confidence="High")]
    )
    validator = LeaveApplicationValidator(doc)
    results = await validator.validate()
    
    assert results["policy"]["passed"] is False
    assert results["policy"]["severity"] == "POLICY_FLAG"
    
    decision, reason = route_document(doc, results)
    assert decision == "REVIEW"

@pytest.mark.asyncio
async def test_case_5_conflict(mock_db):
    doc = UniversalDocumentSchema(
        student_id="12",
        leave_start_date="2025-04-19",
        leave_end_date="2025-04-20",
        extracted_fields=[ExtractedField(key="Reason", value="Sick", confidence="High")]
    )
    validator = LeaveApplicationValidator(doc)
    results = await validator.validate()
    
    assert results["conflict"]["passed"] is False
    
    decision, reason = route_document(doc, results)
    assert decision == "REVIEW"

@pytest.mark.asyncio
async def test_case_6_low_confidence(mock_db):
    doc = UniversalDocumentSchema(
        student_id="S101",
        leave_start_date="2025-05-01",
        leave_end_date="2025-05-02",
        extracted_fields=[ExtractedField(key="Reason", value="Sick", confidence="Low")]
    )
    validator = LeaveApplicationValidator(doc)
    results = await validator.validate()
    
    decision, reason = route_document(doc, results)
    assert decision == "REVIEW"

@pytest.mark.asyncio
async def test_case_7_critical_overrides_confidence(mock_db):
    doc = UniversalDocumentSchema(
        student_id="999", # Missing
        leave_start_date="2025-05-01",
        leave_end_date="2025-05-02",
        extracted_fields=[ExtractedField(key="Reason", value="Sick", confidence="High")]
    )
    validator = LeaveApplicationValidator(doc)
    results = await validator.validate()
    
    decision, reason = route_document(doc, results)
    assert decision == "EXCEPTION"


@pytest.mark.asyncio
async def test_case_8_handwritten_student_format(mock_db):
    """
    Test exactly the extraction shape from the handwritten request:
    Student ID: STU-001
    Leave from: 2026-08-18 (normalized from 18/08/2026)
    to: 2026-08-19 (normalized from 19/08/2026)
    """
    doc = UniversalDocumentSchema(
        student_id="STU-001",
        leave_start_date="2026-08-18",
        leave_end_date="2026-08-19",
        extracted_fields=[ExtractedField(key="Reason", value="Family Event", confidence="High")]
    )
    validator = LeaveApplicationValidator(doc)
    results = await validator.validate()
    
    assert results["identity"]["passed"] is True, "Identity check should pass for exactly STU-001"
    assert results["temporal"]["passed"] is True, "Temporal check should pass for ISO YYYY-MM-DD dates"
    
    decision, reason = route_document(doc, results)
    assert decision == "AUTO"
