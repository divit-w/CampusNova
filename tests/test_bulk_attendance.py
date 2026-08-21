import pytest
from app.schemas.attendance import BulkAttendanceExtraction, StudentAttendanceRow, ProcessedAttendanceRow, ValidationResult
from app.services.validation_engine import BulkAttendanceValidator
from app.services.decision_engine import route_bulk_attendance

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
                    match = False
                    break
            if match:
                return item
        return None

class MockMongoDB:
    def __init__(self):
        self.students_collection = MockMongoCollection([
            {"student_id": "S101", "full_name": "Test Student 1"},
            {"student_id": "S102", "full_name": "Test Student 2"}
        ])
        self.student_attendance_collection = MockMongoCollection([
            {"student_id": "S101", "date": "2023-10-15"}
        ])

@pytest.fixture
def mock_db(monkeypatch):
    db = MockMongoDB()
    import app.services.validation_engine
    monkeypatch.setattr(app.services.validation_engine, "mongo_db", db)
    return db

@pytest.mark.asyncio
async def test_all_rows_valid(mock_db):
    extraction = BulkAttendanceExtraction(
        date="2023-10-16",
        class_section="10-A",
        records=[
            StudentAttendanceRow(student_id="S101", student_name="Test Student 1", status="present"),
            StudentAttendanceRow(student_id="S102", student_name="Test Student 2", status="absent")
        ]
    )
    validator = BulkAttendanceValidator()
    rows = await validator.validate_batch(extraction)
    
    assert len(rows) == 2
    overall, reason = route_bulk_attendance(rows)
    assert overall == "AUTO"
    assert rows[0].decision == "VALID"
    assert rows[1].decision == "VALID"

@pytest.mark.asyncio
async def test_unknown_student_causes_review(mock_db):
    extraction = BulkAttendanceExtraction(
        date="2023-10-16",
        records=[
            StudentAttendanceRow(student_id="S101", status="present"),
            StudentAttendanceRow(student_id="UNKNOWN_ID", status="present")
        ]
    )
    validator = BulkAttendanceValidator()
    rows = await validator.validate_batch(extraction)
    overall, reason = route_bulk_attendance(rows)
    
    assert overall == "REVIEW"
    assert rows[0].decision == "VALID"
    assert rows[1].decision == "EXCEPTION"
    assert "not found" in rows[1].validations["identity"].message.lower()

@pytest.mark.asyncio
async def test_conflict_causes_review(mock_db):
    extraction = BulkAttendanceExtraction(
        date="2023-10-15", # Conflict for S101
        records=[
            StudentAttendanceRow(student_id="S101", status="present"),
            StudentAttendanceRow(student_id="S102", status="present")
        ]
    )
    validator = BulkAttendanceValidator()
    rows = await validator.validate_batch(extraction)
    overall, reason = route_bulk_attendance(rows)
    
    assert overall == "REVIEW"
    assert rows[0].decision == "REVIEW"
    assert rows[0].validations["conflict"].passed is False
    assert rows[1].decision == "VALID"

@pytest.mark.asyncio
async def test_invalid_date_causes_exception(mock_db):
    extraction = BulkAttendanceExtraction(
        date="invalid-date",
        records=[
            StudentAttendanceRow(student_id="S101", status="present")
        ]
    )
    validator = BulkAttendanceValidator()
    rows = await validator.validate_batch(extraction)
    overall, reason = route_bulk_attendance(rows)
    
    assert overall == "EXCEPTION"
    assert rows[0].decision == "EXCEPTION"

@pytest.mark.asyncio
async def test_invalid_status(mock_db):
    extraction = BulkAttendanceExtraction(
        date="2023-10-16",
        records=[
            StudentAttendanceRow(student_id="S101", status="invalid_status")
        ]
    )
    validator = BulkAttendanceValidator()
    rows = await validator.validate_batch(extraction)
    overall, reason = route_bulk_attendance(rows)
    
    assert overall == "EXCEPTION"
    assert rows[0].decision == "EXCEPTION"
