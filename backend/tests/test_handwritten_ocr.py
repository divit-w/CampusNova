import pytest
import cv2
import numpy as np
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import create_access_token
from app.services.image_preprocessing import image_preprocessor
from app.services.date_extractor import date_extractor
from app.services.entity_matcher import entity_matcher
from app.schemas.documents import UniversalDocumentSchema

client = TestClient(app)

def admin_token(university_id="demo-university"):
    return create_access_token("admin1", "admin")

# ── 1. Image Preprocessing Tests ──────────────────────────────────────────────

def test_image_preprocessing_pipeline_stroke_preservation():
    """Verify image preprocessing enhances contrast, denoises, and preserves stroke fidelity."""
    # Create synthetic test document image with text strokes
    img = np.full((300, 400, 3), 240, dtype=np.uint8)
    # Draw handwriting-like lines
    cv2.line(img, (50, 100), (350, 100), (40, 40, 40), 2)
    cv2.putText(img, "Leave Application", (60, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (20, 20, 20), 2)
    
    is_success, buffer = cv2.imencode(".jpg", img)
    assert is_success
    raw_bytes = buffer.tobytes()

    processed_bytes, meta = image_preprocessor.preprocess_image(raw_bytes)
    assert len(processed_bytes) > 0
    assert meta["contrast_enhanced"] is True
    assert meta["denoised"] is True
    assert meta["stroke_preserved"] is True
    assert meta["upscaled"] is True  # Low dimensions (300x400) should trigger adaptive upscaling
    assert meta["processed_dimensions"][0] >= 400

def test_image_preprocessing_deskew():
    """Verify image preprocessing calculates and corrects skew angle."""
    img = np.full((500, 500, 3), 255, dtype=np.uint8)
    # Draw horizontal text lines
    for y in range(100, 400, 50):
        cv2.line(img, (50, y), (450, y), (0, 0, 0), 2)

    # Rotate by 5 degrees to simulate skewed scan
    M = cv2.getRotationMatrix2D((250, 250), 5.0, 1.0)
    skewed = cv2.warpAffine(img, M, (500, 500), borderValue=(255, 255, 255))
    
    is_success, buffer = cv2.imencode(".jpg", skewed)
    raw_bytes = buffer.tobytes()

    _, meta = image_preprocessor.preprocess_image(raw_bytes)
    assert isinstance(meta["deskew_angle"], float)

# ── 2. Handwritten Date Extractor Tests ────────────────────────────────────────

def test_date_extractor_various_handwritten_formats():
    """Verify date extractor normalizes diverse handwritten formats to ISO YYYY-MM-DD."""
    # DD/MM/YY
    res1 = date_extractor.parse_single_date("24/8/26")
    assert res1.status == "valid"
    assert res1.normalized_iso == "2026-08-24"

    # DD-MM-YYYY
    res2 = date_extractor.parse_single_date("26-08-2026")
    assert res2.status == "valid"
    assert res2.normalized_iso == "2026-08-26"

    # Written month: 24th August 2026
    res3 = date_extractor.parse_single_date("24th August 2026")
    assert res3.status == "valid"
    assert res3.normalized_iso == "2026-08-24"

    # Written month: 24 Aug 2026
    res4 = date_extractor.parse_single_date("24 Aug 2026")
    assert res4.status == "valid"
    assert res4.normalized_iso == "2026-08-24"

    # Written month: August 24, 2026
    res5 = date_extractor.parse_single_date("August 24, 2026")
    assert res5.status == "valid"
    assert res5.normalized_iso == "2026-08-24"

    # OCR character artifacts in handwritten numbers (e.g. O for 0, l for 1, S for 5)
    res6 = date_extractor.parse_single_date("l8/O8/26")
    assert res6.status == "valid"
    assert res6.normalized_iso == "2026-08-18"

def test_date_extractor_impossible_dates():
    """Verify impossible dates (e.g. Feb 31, Month 13) are rejected without guessing."""
    res_feb31 = date_extractor.parse_single_date("31/02/2026")
    assert res_feb31.status == "impossible_date"
    assert res_feb31.normalized_iso is None

    res_month13 = date_extractor.parse_single_date("15/13/2026")
    assert res_month13.status == "impossible_date"
    assert res_month13.normalized_iso is None

    res_day32 = date_extractor.parse_single_date("32/08/2026")
    assert res_day32.status == "impossible_date"

def test_date_extractor_leave_range_validation():
    """Verify date extractor detects start/end date ranges and flags inverted ranges."""
    text_valid = "I request leave from 24/8/26 to 26/8/26 due to fever."
    s_res, e_res = date_extractor.extract_leave_dates(text_valid)
    assert s_res.status == "valid"
    assert s_res.normalized_iso == "2026-08-24"
    assert e_res.status == "valid"
    assert e_res.normalized_iso == "2026-08-26"

    # Inverted range
    text_inverted = "Leave period: 26/08/2026 to 24/08/2026."
    s_inv, e_inv = date_extractor.extract_leave_dates(text_inverted)
    assert s_inv.normalized_iso == "2026-08-26"
    assert e_inv.status == "invalid_range"

# ── 3. Tenant Fuzzy Entity Matching Tests ───────────────────────────────────────

@pytest.mark.asyncio
async def test_fuzzy_name_matching_ocr_artifacts():
    """Verify entity matcher corrects OCR artifacts like 'Divlt Sharma' -> 'Divit Sharma'."""
    with patch("app.services.entity_matcher.mongo_db.students_collection.find") as mock_find:
        mock_cursor = MagicMock()
        mock_cursor.to_list = AsyncMock(return_value=[
            {"student_id": "STU-001", "full_name": "Divit Sharma", "grade": "CSE-A"},
            {"student_id": "STU-002", "full_name": "Aarav Patel", "grade": "CSE-A"},
            {"student_id": "STU-003", "full_name": "Meera Gupta", "grade": "CSE-B"}
        ])
        mock_find.return_value = mock_cursor

        result = await entity_matcher.match_student(
            raw_name="Divlt Sharma",
            raw_id=None,
            university_id="demo-university"
        )
        assert result.matched_id == "STU-001"
        assert result.matched_name == "Divit Sharma"
        assert result.confidence >= 0.90
        assert len(result.candidates) > 0

@pytest.mark.asyncio
async def test_fuzzy_faculty_name_matching():
    """Verify faculty matching for 'Dr Shanna' -> 'Dr. Sharma'."""
    with patch("app.services.entity_matcher.mongo_db.teachers_collection.find") as mock_find:
        mock_cursor = MagicMock()
        mock_cursor.to_list = AsyncMock(return_value=[
            {"teacher_id": "F01", "full_name": "Dr. Sharma", "subject": "Data Structures"},
            {"teacher_id": "F02", "full_name": "Prof. Verma", "subject": "Database Systems"}
        ])
        mock_find.return_value = mock_cursor

        result = await entity_matcher.match_faculty(
            raw_name="Dr Shanna",
            raw_id=None,
            university_id="demo-university"
        )
        assert result.matched_id == "F01"
        assert result.matched_name == "Dr. Sharma"
        assert result.confidence >= 0.80

@pytest.mark.asyncio
async def test_similar_names_require_admin_selection():
    """When multiple people have similar names, entity matcher sets requires_admin_selection=True."""
    with patch("app.services.entity_matcher.mongo_db.students_collection.find") as mock_find:
        mock_cursor = MagicMock()
        mock_cursor.to_list = AsyncMock(return_value=[
            {"student_id": "STU-004", "full_name": "Rohan Sharma", "grade": "ECE-A"},
            {"student_id": "STU-005", "full_name": "Rohan Verma", "grade": "ECE-A"}
        ])
        mock_find.return_value = mock_cursor

        result = await entity_matcher.match_student(
            raw_name="Rohan",
            raw_id=None,
            university_id="demo-university"
        )
        assert result.requires_admin_selection is True
        assert len(result.candidates) == 2

@pytest.mark.asyncio
async def test_strict_tenant_isolation_in_entity_matching():
    """Verify student from Tenant B is NEVER matched when searching Tenant A."""
    with patch("app.services.entity_matcher.mongo_db.students_collection.find") as mock_find:
        # Tenant A has only Divit Sharma
        def find_side_effect(query, projection=None):
            univ = query.get("university_id")
            mock_cursor = MagicMock()
            if univ == "tenant-a":
                mock_cursor.to_list = AsyncMock(return_value=[
                    {"student_id": "STU-A1", "full_name": "Divit Sharma"}
                ])
            else:
                mock_cursor.to_list = AsyncMock(return_value=[
                    {"student_id": "STU-B1", "full_name": "Secret Student B"}
                ])
            return mock_cursor

        mock_find.side_effect = find_side_effect

        # Query Tenant A with name belonging only to Tenant B
        result = await entity_matcher.match_student(
            raw_name="Secret Student B",
            raw_id=None,
            university_id="tenant-a"
        )
        # Should not match Secret Student B in Tenant A
        assert result.matched_name != "Secret Student B"
        assert result.status in ["not_found", "needs_review"]

# ── 4. End-to-End Pipeline & Operational Action Gating Tests ───────────────────

def test_extract_endpoint_never_triggers_operational_actions():
    """
    CRITICAL SAFETY REQUIREMENT:
    POST /documents/extract must NEVER modify attendance, create substitutions,
    or insert active operational alerts. Status must remain pending_manual_review.
    """
    # Create synthetic test file
    img = np.full((300, 400, 3), 250, dtype=np.uint8)
    cv2.putText(img, "Student Leave: Divit Sharma 24/8/26 to 26/8/26", (20, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
    _, buffer = cv2.imencode(".jpg", img)
    fake_bytes = buffer.tobytes()

    with patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock) as mock_user, \
         patch("app.api.v1.endpoints.documents.document_service.index_document", new_callable=AsyncMock) as mock_index, \
         patch("app.api.v1.endpoints.documents.mongo_db.student_attendance_collection.bulk_write", new_callable=AsyncMock) as mock_att_write, \
         patch("app.api.v1.endpoints.documents.mongo_db.alerts_collection.insert_one", new_callable=AsyncMock) as mock_alert, \
         patch("app.api.v1.endpoints.documents.mongo_db.substitutions_collection.update_one", new_callable=AsyncMock) as mock_sub, \
         patch("app.api.v1.endpoints.documents.mongo_db.knowledge_collection.update_one", new_callable=AsyncMock) as mock_kb, \
         patch("app.api.v1.endpoints.documents.mongo_db.document_audit_collection.insert_one", new_callable=AsyncMock) as mock_audit:
        
        mock_user.return_value = {"id": "admin1", "role": "admin", "university_id": "demo-university"}

        files = {"file": ("handwritten_leave.jpg", fake_bytes, "image/jpeg")}
        response = client.post(
            "/api/v1/documents/extract",
            files=files,
            headers={"Authorization": f"Bearer {admin_token()}"}
        )

        assert response.status_code == 200
        data = response.json()
        
        # Verify status is strictly pending review
        assert data["status"] == "pending_manual_review"
        assert data["requires_human_review"] is True
        
        # Verify NO operational side effects occurred during extraction
        mock_att_write.assert_not_called()
        mock_alert.assert_not_called()
        mock_sub.assert_not_called()

def test_approve_endpoint_executes_operational_actions_after_review():
    """
    POST /documents/{id}/approve applies verified changes:
    - Marks student attendance as excused
    - Emits alert
    - Stores immutable audit trail
    """
    doc_payload = {
        "document_type": "STUDENT_LEAVE_FORM",
        "document_category": "Student Leave Application",
        "student_id": "STU-001",
        "student_name": "Divit Sharma",
        "leave_start_date": "2026-08-24",
        "leave_end_date": "2026-08-26",
        "leave_type": "Medical Absence",
        "summary": "Handwritten student leave application.",
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
        mock_student.return_value = {"student_id": "STU-001", "full_name": "Divit Sharma", "grade": "CSE-A"}
        mock_doc_app.return_value = True

        response = client.post(
            "/api/v1/documents/doc-hw-01/approve",
            json=doc_payload,
            headers={"Authorization": f"Bearer {admin_token()}"}
        )

        assert response.status_code == 200
        assert "Excused" in response.json()["message"]
        
        # Verify 3 days (Aug 24, Aug 25, Aug 26) attendance marked
        mock_att_write.assert_called_once()
        ops = mock_att_write.call_args[0][0]
        assert len(ops) == 3
        assert ops[0]._doc["$set"]["status"] == "excused"
        
        # Verify operational alert emitted
        mock_alert.assert_called_once()
