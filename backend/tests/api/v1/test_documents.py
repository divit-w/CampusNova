import json
from unittest.mock import patch, AsyncMock, MagicMock
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

from app.core.security import create_access_token

def admin_token():
    return create_access_token("admin1", "admin")

def test_extract_document_success():
    """Test successful document extraction with a mocked AsyncOpenAI response."""
    mock_choice = MagicMock()
    mock_choice.message.content = json.dumps({
        "document_category": "Leave Application",
        "summary": "Request for sick leave.",
        "student_name": "Jane Doe",
        "student_id": "ADM-98765",
        "leave_start_date": "2026-09-01",
        "leave_end_date": "2026-09-02",
        "leave_type": "Sick",
        "extracted_fields": [
            {"key": "Student Name", "value": "Jane Doe", "confidence": "High"},
            {"key": "Admission Number", "value": "ADM-98765", "confidence": "High"}
        ],
        "requires_human_review": False
    })
    
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]

    with patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock) as mock_user, \
         patch("app.api.v1.endpoints.documents.client.chat.completions.create", new_callable=AsyncMock) as mock_create, \
         patch("app.api.v1.endpoints.documents.document_service.index_document", new_callable=AsyncMock) as mock_index, \
         patch("app.api.v1.endpoints.documents.mongo_db.students_collection.find_one", new_callable=AsyncMock) as mock_mongo, \
         patch("app.services.document_classifier.mongo_db.students_collection.find_one", new_callable=AsyncMock) as mock_class_student, \
         patch("app.services.validation_engine.mongo_db.students_collection.find_one", new_callable=AsyncMock) as mock_ve_student, \
         patch("app.services.validation_engine.mongo_db.student_attendance_collection.find_one", new_callable=AsyncMock) as mock_att_find, \
         patch("app.api.v1.endpoints.documents.mongo_db.student_attendance_collection.bulk_write", new_callable=AsyncMock) as mock_att, \
         patch("app.api.v1.endpoints.documents.mongo_db.document_audit_collection.insert_one", new_callable=AsyncMock) as mock_audit, \
         patch("app.api.v1.endpoints.documents.mongo_db.knowledge_collection.update_one", new_callable=AsyncMock) as mock_kb:
        mock_user.return_value = {"id": "admin1", "role": "admin"}
        mock_create.return_value = mock_response
        mock_mongo.return_value = {"student_id": "ADM-98765", "full_name": "Jane Doe", "grade": "11A"}
        mock_class_student.return_value = {"student_id": "ADM-98765", "full_name": "Jane Doe", "grade": "11A"}
        mock_ve_student.return_value = {"student_id": "ADM-98765", "full_name": "Jane Doe", "grade": "11A"}
        mock_att_find.return_value = None

        # Simulated image file bytes (must be > 5KB to pass the integrity gate)
        fake_bytes = b"fake_image_bytes" * 400
        files = {"file": ("student_leave_application_form.png", fake_bytes, "image/png")}
        response = client.post(
            "/api/v1/documents/extract",
            files=files,
            headers={"Authorization": f"Bearer {admin_token()}"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "Leave" in data["document_category"] or data["document_type"] == "STUDENT_LEAVE_FORM"
        assert isinstance(data["summary"], str) and data["summary"].strip()
        assert len(data["extracted_fields"]) >= 1
        assert "document_id" in data
        assert isinstance(data["document_id"], str)

        if mock_create.await_count:
            assert data["summary"] == "Request for sick leave."
            assert len(data["extracted_fields"]) == 2
            assert data["extracted_fields"][0]["value"] == "Jane Doe"

        mock_index.assert_called_once()

def test_extract_document_validation_error_non_image():
    """Test 422 validation error when uploading a non-image file (e.g. text file)."""
    with patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock) as mock_user:
        mock_user.return_value = {"id": "admin1", "role": "admin"}
        files = {"file": ("test_document.txt", b"plain text content", "text/plain")}
        response = client.post(
            "/api/v1/documents/extract",
            files=files,
            headers={"Authorization": f"Bearer {admin_token()}"}
        )

        assert response.status_code == 422
        assert "detail" in response.json()

def test_extract_document_validation_error_missing_file():
    """Test 422 validation error when no file payload is provided."""
    with patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock) as mock_user:
        mock_user.return_value = {"id": "admin1", "role": "admin"}
        response = client.post(
            "/api/v1/documents/extract",
            headers={"Authorization": f"Bearer {admin_token()}"}
        )

        assert response.status_code == 422
        assert "detail" in response.json()

def test_approve_document_valid_leave_syncs_attendance():
    """Test approving a valid leave document updates attendance records to excused."""
    doc_payload = {
        "document_type": "STUDENT_LEAVE_FORM",
        "document_category": "Leave Application",
        "student_id": "STU-001",
        "student_name": "Arjun Choudhury",
        "leave_start_date": "2026-08-18",
        "leave_end_date": "2026-08-19",
        "leave_type": "Medical",
        "summary": "Medical leave application.",
        "extracted_fields": []
    }

    with patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock) as mock_user, \
         patch("app.api.v1.endpoints.documents.mongo_db.students_collection.find_one", new_callable=AsyncMock) as mock_student, \
         patch("app.api.v1.endpoints.documents.mongo_db.student_attendance_collection.bulk_write", new_callable=AsyncMock) as mock_att_write, \
         patch("app.api.v1.endpoints.documents.document_service.approve_document", new_callable=AsyncMock) as mock_doc_app, \
         patch("app.api.v1.endpoints.documents.mongo_db.document_audit_collection.insert_one", new_callable=AsyncMock) as mock_audit, \
         patch("app.api.v1.endpoints.documents.mongo_db.knowledge_collection.update_one", new_callable=AsyncMock) as mock_kb:
        
        mock_user.return_value = {"id": "admin1", "role": "admin", "university_id": "demo-university"}
        mock_student.return_value = {"student_id": "STU-001", "full_name": "Arjun Choudhury", "grade": "10A"}
        mock_doc_app.return_value = True

        response = client.post(
            "/api/v1/documents/doc-12345/approve",
            json=doc_payload,
            headers={"Authorization": f"Bearer {admin_token()}"}
        )

        assert response.status_code == 200
        assert "Excused" in response.json()["message"] or "attendance" in response.json()["message"].lower()
        mock_att_write.assert_called_once()
        ops = mock_att_write.call_args[0][0]
        assert len(ops) == 2  # 2026-08-18 and 2026-08-19
        assert ops[0]._filter == {"student_id": "STU-001", "date": "2026-08-18", "university_id": "demo-university"}
        assert ops[0]._doc["$set"]["status"] == "excused"
        assert ops[0]._doc["$set"]["source_document_id"] == "doc-12345"
        assert ops[1]._filter == {"student_id": "STU-001", "date": "2026-08-19", "university_id": "demo-university"}
        assert ops[1]._doc["$set"]["status"] == "excused"

def test_approve_document_unknown_student_rejected():
    """Test approving document with unknown student returns 400 and does NOT mutate attendance."""
    doc_payload = {
        "document_category": "Leave Application",
        "student_id": "UNKNOWN-999",
        "student_name": "Ghost Student",
        "leave_start_date": "2026-08-18",
        "leave_end_date": "2026-08-18",
        "extracted_fields": []
    }

    with patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock) as mock_user, \
         patch("app.api.v1.endpoints.documents.mongo_db.students_collection.find_one", new_callable=AsyncMock) as mock_student, \
         patch("app.api.v1.endpoints.documents.mongo_db.student_attendance_collection.bulk_write", new_callable=AsyncMock) as mock_att_write:
        
        mock_user.return_value = {"id": "admin1", "role": "admin"}
        mock_student.return_value = None

        response = client.post(
            "/api/v1/documents/doc-unknown/approve",
            json=doc_payload,
            headers={"Authorization": f"Bearer {admin_token()}"}
        )

        assert response.status_code == 400
        assert "Student could not be verified" in response.json()["detail"]
        mock_att_write.assert_not_called()

def test_approve_document_invalid_dates_rejected():
    """Test approving document with start_date > end_date returns 400 and does NOT mutate attendance."""
    doc_payload = {
        "document_category": "Leave Application",
        "student_id": "STU-001",
        "leave_start_date": "2026-08-25",
        "leave_end_date": "2026-08-18",
        "extracted_fields": []
    }

    with patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock) as mock_user, \
         patch("app.api.v1.endpoints.documents.mongo_db.students_collection.find_one", new_callable=AsyncMock) as mock_student, \
         patch("app.api.v1.endpoints.documents.mongo_db.student_attendance_collection.bulk_write", new_callable=AsyncMock) as mock_att_write:
        
        mock_user.return_value = {"id": "admin1", "role": "admin"}
        mock_student.return_value = {"student_id": "STU-001", "full_name": "Arjun Choudhury"}

        response = client.post(
            "/api/v1/documents/doc-inv-dates/approve",
            json=doc_payload,
            headers={"Authorization": f"Bearer {admin_token()}"}
        )

        assert response.status_code == 400
        assert "cannot be after" in response.json()["detail"]
        mock_att_write.assert_not_called()

def test_approve_document_malformed_dates_rejected():
    """Test approving document with malformed date strings returns 400."""
    doc_payload = {
        "document_category": "Leave Application",
        "student_id": "STU-001",
        "leave_start_date": "invalid-date",
        "extracted_fields": []
    }

    with patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock) as mock_user, \
         patch("app.api.v1.endpoints.documents.mongo_db.students_collection.find_one", new_callable=AsyncMock) as mock_student, \
         patch("app.api.v1.endpoints.documents.mongo_db.student_attendance_collection.bulk_write", new_callable=AsyncMock) as mock_att_write:
        
        mock_user.return_value = {"id": "admin1", "role": "admin"}
        mock_student.return_value = {"student_id": "STU-001", "full_name": "Arjun Choudhury"}

        response = client.post(
            "/api/v1/documents/doc-malformed/approve",
            json=doc_payload,
            headers={"Authorization": f"Bearer {admin_token()}"}
        )

        assert response.status_code == 400
        assert "Invalid date format" in response.json()["detail"]
        mock_att_write.assert_not_called()

def test_approve_document_reapproval_is_idempotent():
    """Test re-approving the same document runs upsert identically."""
    doc_payload = {
        "document_category": "Leave Application",
        "student_id": "STU-001",
        "leave_start_date": "2026-08-18",
        "leave_end_date": "2026-08-18",
        "extracted_fields": []
    }

    with patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock) as mock_user, \
         patch("app.api.v1.endpoints.documents.mongo_db.students_collection.find_one", new_callable=AsyncMock) as mock_student, \
         patch("app.api.v1.endpoints.documents.mongo_db.student_attendance_collection.bulk_write", new_callable=AsyncMock) as mock_att_write, \
         patch("app.api.v1.endpoints.documents.document_service.approve_document", new_callable=AsyncMock) as mock_doc_app, \
         patch("app.api.v1.endpoints.documents.mongo_db.document_audit_collection.insert_one", new_callable=AsyncMock) as mock_audit, \
         patch("app.api.v1.endpoints.documents.mongo_db.alerts_collection.insert_one", new_callable=AsyncMock) as mock_alert, \
         patch("app.api.v1.endpoints.documents.mongo_db.knowledge_collection.update_one", new_callable=AsyncMock) as mock_kb:
        
        mock_user.return_value = {"id": "admin1", "role": "admin", "university_id": "demo-university"}
        mock_student.return_value = {"student_id": "STU-001", "full_name": "Arjun Choudhury"}
        mock_doc_app.return_value = True

        res1 = client.post("/api/v1/documents/doc-idem/approve", json=doc_payload, headers={"Authorization": f"Bearer {admin_token()}"})
        res2 = client.post("/api/v1/documents/doc-idem/approve", json=doc_payload, headers={"Authorization": f"Bearer {admin_token()}"})

        assert res1.status_code == 200
        assert res2.status_code == 200
        assert mock_att_write.call_count == 2
        # Both operations are upsert=True with identical filter and $set
        ops1 = mock_att_write.call_args_list[0][0][0]
        ops2 = mock_att_write.call_args_list[1][0][0]
        assert ops1[0]._filter == ops2[0]._filter == {"student_id": "STU-001", "date": "2026-08-18", "university_id": "demo-university"}
        assert ops1[0]._doc["$set"]["status"] == ops2[0]._doc["$set"]["status"] == "excused"


def test_approve_faculty_leave_form_workflow():
    """Test approving faculty leave computes timetable impact and returns substitute route."""
    doc_payload = {
        "document_type": "FACULTY_LEAVE_FORM",
        "document_category": "Faculty Leave Application",
        "faculty_id": "F01",
        "faculty_name": "Dr. Sharma",
        "leave_start_date": "2026-08-24",
        "summary": "Faculty emergency leave request.",
        "affected_classes": [
            {"period": "P1", "time": "09:00–10:00", "cohort": "CSE-A", "subject": "Data Structures", "room": "LH-101"}
        ]
    }

    with patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock) as mock_user, \
         patch("app.api.v1.endpoints.documents.mongo_db.teachers_collection.find_one", new_callable=AsyncMock) as mock_teacher, \
         patch("app.api.v1.endpoints.documents.document_service.approve_document", new_callable=AsyncMock) as mock_doc_app, \
         patch("app.api.v1.endpoints.documents.mongo_db.document_audit_collection.insert_one", new_callable=AsyncMock) as mock_audit, \
         patch("app.api.v1.endpoints.documents.mongo_db.knowledge_collection.update_one", new_callable=AsyncMock) as mock_kb:
        
        mock_user.return_value = {"id": "admin1", "role": "admin", "university_id": "demo-university"}
        mock_teacher.return_value = {"id": "F01", "name": "Dr. Sharma"}
        mock_doc_app.return_value = True

        response = client.post(
            "/api/v1/documents/doc-fac-01/approve",
            json=doc_payload,
            headers={"Authorization": f"Bearer {admin_token()}"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["document_type"] == "FACULTY_LEAVE_FORM"
        assert "/substitute?faculty=F01" in data["substitute_route"]
        assert len(data["affected_classes"]) == 1


def test_approve_admission_and_fee_documents():
    """Test approval flows for admission form and fee receipt."""
    with patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock) as mock_user, \
         patch("app.api.v1.endpoints.documents.document_service.approve_document", new_callable=AsyncMock) as mock_doc_app, \
         patch("app.api.v1.endpoints.documents.mongo_db.document_audit_collection.insert_one", new_callable=AsyncMock) as mock_audit, \
         patch("app.api.v1.endpoints.documents.mongo_db.knowledge_collection.update_one", new_callable=AsyncMock) as mock_kb:
        
        mock_user.return_value = {"id": "admin1", "role": "admin", "university_id": "demo-university"}
        mock_doc_app.return_value = True

        # 1. Admission Form
        adm_res = client.post(
            "/api/v1/documents/doc-adm-01/approve",
            json={
                "document_type": "ADMISSION_FORM",
                "applicant_name": "Rohan Gupta",
                "applicant_program": "B.Tech CSE"
            },
            headers={"Authorization": f"Bearer {admin_token()}"}
        )
        assert adm_res.status_code == 200
        assert adm_res.json()["document_type"] == "ADMISSION_FORM"

        # 2. Fee Receipt
        fee_res = client.post(
            "/api/v1/documents/doc-fee-01/approve",
            json={
                "document_type": "FEE_RECEIPT",
                "receipt_number": "REC-9999",
                "fee_amount": "₹45,000"
            },
            headers={"Authorization": f"Bearer {admin_token()}"}
        )
        assert fee_res.status_code == 200
        assert "Finance integration is not configured" in fee_res.json()["message"]
