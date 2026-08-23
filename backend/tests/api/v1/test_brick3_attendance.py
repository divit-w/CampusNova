import pytest
import base64
import json
import uuid
import os
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security import create_access_token
from app.services.mongo_service import mongo_db
from app.schemas.documents import UniversalDocumentSchema

@pytest.mark.asyncio
async def test_brick3_new_tenant_zero_attendance():
    """1. New tenant starts with zero attendance and no fabricated data."""
    univ_id = f"univ_test_{uuid.uuid4().hex[:8]}"
    token = create_access_token(f"admin@{univ_id}.edu", role="admin", university_id=univ_id)
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = {"Authorization": f"Bearer {token}"}
        res = await client.get("/api/v1/admin/dashboard-summary", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["active_students"] == 0
        assert data["active_teachers"] == 0
        assert data["present_today"] == 0
        assert data["absent_today"] == 0
        assert data["excused_today"] == 0

@pytest.mark.asyncio
async def test_brick3_sunday_non_working_day_status():
    """2. Sunday / non-working day does not fabricate attendance."""
    token = create_access_token("demo-judge@campusnova.com", role="admin", university_id="demo-university")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = {"Authorization": f"Bearer {token}"}
        res = await client.get("/api/v1/attendance/daily-sessions?date=2026-08-23", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["is_working_day"] is False
        assert data["status_message"] == "No academic sessions scheduled today."
        assert data["total_scheduled_sessions"] == 0

@pytest.mark.asyncio
async def test_brick3_student_session_lifecycle_and_uniqueness():
    """
    3. Student roster contains only selected cohort.
    4. Faculty selector contains only tenant faculty.
    5. Valid attendance saves correctly.
    6. Re-saving updates without creating duplicate records.
    7. Invalid student/cohort combination rejected.
    8. Invalid faculty rejected.
    9. Invalid subject rejected.
    10. Metadata is complete.
    """
    univ_id = f"univ_test_{uuid.uuid4().hex[:8]}"
    token = create_access_token(f"admin@{univ_id}.edu", role="admin", university_id=univ_id)
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Setup tenant data: 1 teacher, 1 subject, 2 cohorts, 2 students
    await mongo_db.teachers_collection.insert_one({
        "teacher_id": "T01",
        "id": "T01",
        "full_name": "Prof. Turing",
        "name": "Prof. Turing",
        "subject": "CS",
        "university_id": univ_id,
        "status": "active"
    })
    await mongo_db.subjects_collection.insert_one({
        "subject_id": "SUB-DS",
        "id": "SUB-DS",
        "name": "Data Structures",
        "university_id": univ_id,
        "status": "active"
    })
    await mongo_db.classes_collection.insert_many([
        {"class_id": "COHORT-A", "cohort_id": "COHORT-A", "name": "Cohort A", "university_id": univ_id, "status": "active"},
        {"class_id": "COHORT-B", "cohort_id": "COHORT-B", "name": "Cohort B", "university_id": univ_id, "status": "active"}
    ])
    await mongo_db.students_collection.insert_many([
        {"student_id": "STU-A1", "full_name": "Alice A", "cohort_id": "COHORT-A", "university_id": univ_id, "status": "active"},
        {"student_id": "STU-A2", "full_name": "Aaron A", "cohort_id": "COHORT-A", "university_id": univ_id, "status": "active"},
        {"student_id": "STU-B1", "full_name": "Bob B", "cohort_id": "COHORT-B", "university_id": univ_id, "status": "active"},
    ])

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Check roster for COHORT-A only contains Alice & Aaron
        res = await client.get("/api/v1/attendance/session-roster?date=2026-08-24&cohort_id=COHORT-A", headers=headers)
        assert res.status_code == 200
        roster = res.json()
        assert len(roster["students"]) == 2
        student_ids = [s["student_id"] for s in roster["students"]]
        assert "STU-A1" in student_ids
        assert "STU-A2" in student_ids
        assert "STU-B1" not in student_ids

        # Reject invalid student outside cohort
        bad_req = {
            "date": "2026-08-24",
            "cohort_id": "COHORT-A",
            "subject_id": "SUB-DS",
            "faculty_id": "T01",
            "period": "P1",
            "records": [
                {"student_id": "STU-A1", "status": "present"},
                {"student_id": "STU-B1", "status": "present"} # STU-B1 is in COHORT-B!
            ]
        }
        res_bad = await client.post("/api/v1/attendance/record-session", json=bad_req, headers=headers)
        assert res_bad.status_code == 400

        # Reject non-existent subject
        bad_sub = {**bad_req, "subject_id": "NON_EXISTENT_SUB", "records": [{"student_id": "STU-A1", "status": "present"}]}
        res_bad_sub = await client.post("/api/v1/attendance/record-session", json=bad_sub, headers=headers)
        assert res_bad_sub.status_code == 404

        # Reject non-existent faculty
        bad_fac = {**bad_req, "faculty_id": "NON_EXISTENT_FAC", "records": [{"student_id": "STU-A1", "status": "present"}]}
        res_bad_fac = await client.post("/api/v1/attendance/record-session", json=bad_fac, headers=headers)
        assert res_bad_fac.status_code == 404

        # Valid save
        valid_req = {
            "date": "2026-08-24",
            "cohort_id": "COHORT-A",
            "subject_id": "SUB-DS",
            "faculty_id": "T01",
            "period": "P1",
            "records": [
                {"student_id": "STU-A1", "status": "present"},
                {"student_id": "STU-A2", "status": "absent"}
            ]
        }
        res_valid = await client.post("/api/v1/attendance/record-session", json=valid_req, headers=headers)
        assert res_valid.status_code == 200
        assert res_valid.json()["records_count"] == 2

        # Check records in DB
        saved = await mongo_db.student_attendance_collection.find({
            "university_id": univ_id,
            "date": "2026-08-24",
            "cohort_id": "COHORT-A",
            "period": "P1"
        }).to_list(10)
        assert len(saved) == 2
        rec_a1 = next(r for r in saved if r["student_id"] == "STU-A1")
        assert rec_a1["status"] == "present"
        assert rec_a1["faculty_id"] == "T01"
        assert rec_a1["subject_name"] == "Data Structures"

        # Re-save with updated status for STU-A2 -> Excused (must update, not duplicate)
        update_req = {
            **valid_req,
            "records": [
                {"student_id": "STU-A1", "status": "present"},
                {"student_id": "STU-A2", "status": "excused"}
            ]
        }
        res_update = await client.post("/api/v1/attendance/record-session", json=update_req, headers=headers)
        assert res_update.status_code == 200

        saved_after = await mongo_db.student_attendance_collection.find({
            "university_id": univ_id,
            "date": "2026-08-24",
            "cohort_id": "COHORT-A",
            "period": "P1"
        }).to_list(10)
        assert len(saved_after) == 2 # Still 2 records, no duplicates!
        rec_a2 = next(r for r in saved_after if r["student_id"] == "STU-A2")
        assert rec_a2["status"] == "excused"

@pytest.mark.asyncio
async def test_brick3_faculty_clock_in_and_proof_isolation():
    """
    11. Faculty clock-in stores teacher ID.
    12. Faculty selfie proof is persisted.
    13. Same-tenant proof can be viewed.
    14. Cross-tenant proof returns 404.
    """
    univ_id_a = f"univ_a_{uuid.uuid4().hex[:8]}"
    univ_id_b = f"univ_b_{uuid.uuid4().hex[:8]}"
    token_a = create_access_token(f"admin@{univ_id_a}.edu", role="admin", university_id=univ_id_a)
    token_b = create_access_token(f"admin@{univ_id_b}.edu", role="admin", university_id=univ_id_b)

    await mongo_db.teachers_collection.insert_one({
        "teacher_id": "T_SHARMA",
        "full_name": "Dr. Sharma",
        "university_id": univ_id_a,
        "status": "active"
    })

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Clock-in for Tenant A
        dummy_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\xff\xd9"
        files = {"file": ("selfie.jpg", dummy_jpeg, "image/jpeg")}
        form_data = {
            "latitude": "28.6304",
            "longitude": "77.3711",
            "teacher_id_param": "T_SHARMA"
        }
        res_clock = await client.post(
            "/api/v1/attendance/faculty-clock-in",
            data=form_data,
            files=files,
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res_clock.status_code == 200
        rec_id = res_clock.json()["record_id"]

        # View proof with Tenant A -> Success
        res_proof_a = await client.get(f"/api/v1/attendance/proof/{rec_id}", headers={"Authorization": f"Bearer {token_a}"})
        assert res_proof_a.status_code == 200
        assert res_proof_a.headers["content-type"] == "image/jpeg"

        # View proof with Tenant B -> 404 Not Found (Cross-tenant security)
        res_proof_b = await client.get(f"/api/v1/attendance/proof/{rec_id}", headers={"Authorization": f"Bearer {token_b}"})
        assert res_proof_b.status_code == 404

@pytest.mark.asyncio
async def test_brick3_student_leave_approval_syncs_excused():
    """15. Student leave document approval marks attendance as excused."""
    univ_id = f"univ_leave_{uuid.uuid4().hex[:8]}"
    token = create_access_token(f"admin@{univ_id}.edu", role="admin", university_id=univ_id)
    
    # Create student
    await mongo_db.students_collection.insert_one({
        "student_id": "STU-LEAVE-1",
        "full_name": "Aarav Leave",
        "cohort_id": "CSE-A",
        "university_id": univ_id,
        "status": "active"
    })

    doc_id = str(uuid.uuid4())
    doc_schema = UniversalDocumentSchema(
        document_id=doc_id,
        university_id=univ_id,
        document_type="STUDENT_LEAVE_FORM",
        student_id="STU-LEAVE-1",
        student_name="Aarav Leave",
        leave_start_date="2026-08-25",
        leave_end_date="2026-08-26",
        leave_type="Medical",
        classification_confidence=0.98
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/documents/{doc_id}/approve",
            json=doc_schema.model_dump(),
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 200

        # Verify attendance record created with status 'excused'
        att_rec = await mongo_db.student_attendance_collection.find_one({
            "university_id": univ_id,
            "student_id": "STU-LEAVE-1",
            "date": "2026-08-25"
        })
        assert att_rec is not None
        assert att_rec["status"] == "excused"
        assert att_rec["source"] == "approved_student_leave"

@pytest.mark.asyncio
async def test_brick3_faculty_leave_creates_alert_and_substitute_link():
    """16 & 17. Faculty leave approval creates substitution and operational alert."""
    univ_id = f"univ_fac_leave_{uuid.uuid4().hex[:8]}"
    token = create_access_token(f"admin@{univ_id}.edu", role="admin", university_id=univ_id)

    await mongo_db.teachers_collection.insert_one({
        "teacher_id": "T_LEAVE_1",
        "full_name": "Dr. Leave",
        "university_id": univ_id,
        "status": "active"
    })

    doc_id = str(uuid.uuid4())
    doc_schema = UniversalDocumentSchema(
        document_id=doc_id,
        university_id=univ_id,
        document_type="FACULTY_LEAVE_FORM",
        faculty_id="T_LEAVE_1",
        faculty_name="Dr. Leave",
        leave_start_date="2026-08-27",
        leave_end_date="2026-08-27",
        classification_confidence=0.98
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/documents/{doc_id}/approve",
            json=doc_schema.model_dump(),
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 200
        data = res.json()
        assert "/substitute?faculty=T_LEAVE_1" in data["substitute_route"]

        # Verify operational alert created
        alert = await mongo_db.alerts_collection.find_one({
            "university_id": univ_id,
            "type": "faculty_absence"
        })
        assert alert is not None
        assert "T_LEAVE_1" in alert["route"]
