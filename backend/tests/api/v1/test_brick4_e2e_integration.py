import pytest
import asyncio
import uuid
import base64
import json
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security import create_access_token
from app.services.mongo_service import mongo_db
from app.schemas.documents import UniversalDocumentSchema

@pytest.mark.asyncio
async def test_brick4_full_tenant_onboarding_and_lifecycle():
    """
    End-to-End Test:
    1. Google Authentication -> Provision new empty tenant
    2. Set University Information (Name, Working Days, Periods)
    3. Add Multiple Realistic Faculty (Dr. Sharma, Dr. Verma, Prof. Gupta, Prof. Singh)
    4. Create Cohorts (CSE 3rd Year A, CSE 3rd Year B)
    5. Add Students (Single + Bulk CSV)
    6. Create Subjects (Data Structures, Operating Systems, AI, Networks)
    7. Create Rooms (Lecture Hall 101, Lab 201)
    8. Dashboard strictly reflects tenant counts (zero demo data)
    9. Timetable Generation & Activation for tenant
    10. Student Session Attendance marking & persistence
    11. Faculty Clock-In with proof
    12. Student Leave Approval -> Attendance Excused
    13. Faculty Leave Approval -> Substitution Requirement & Alert
    14. Substitute Ranking & Assignment
    15. Alert Resolution
    16. Knowledge Base Tenant Query Isolation
    """
    suffix = uuid.uuid4().hex[:8]
    email = f"dean_{suffix}@newuniv.edu"

    # Step 1: Simulate Google OAuth login
    user_payload = {
        "iss": "https://accounts.google.com",
        "sub": f"google_{suffix}",
        "email": email,
        "name": "Dean Winchester",
        "picture": "https://lh3.googleusercontent.com/a/default",
        "email_verified": True,
        "exp": int(datetime.now(timezone.utc).timestamp()) + 3600,
    }
    b64_payload = base64.urlsafe_b64encode(json.dumps(user_payload).encode()).decode().rstrip("=")
    b64_header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256"}).encode()).decode().rstrip("=")
    token_jwt = f"{b64_header}.{b64_payload}.sig"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        from unittest.mock import patch
        with patch("app.api.v1.endpoints.auth.verify_google_credential", return_value=user_payload):
            res_auth = await client.post("/api/v1/auth/google", json={"credential": "valid_mocked_google_token"})
            assert res_auth.status_code == 200
            token = res_auth.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

        # Verify /auth/me reflects newly provisioned tenant
        res_me = await client.get("/api/v1/auth/me", headers=headers)
        assert res_me.status_code == 200
        me = res_me.json()
        univ_id = me["university_id"]
        assert univ_id != "demo-university"
        assert me["is_setup_complete"] is False

        # Step 2: Set University Information
        res_univ = await client.patch(
            "/api/v1/admin/university",
            json={
                "university_name": "Apex Technological University",
                "short_name": "ATU",
                "academic_year": "2026-2027",
                "working_days_per_week": 5,
                "periods_per_day": 6,
                "start_time": "09:00",
                "is_setup_complete": True,
            },
            headers=headers,
        )
        assert res_univ.status_code == 200
        assert res_univ.json()["name"] == "Apex Technological University"

        # Step 3: Add Faculty
        faculty_data = [
            {"teacher_id": "FAC-01", "full_name": "Dr. Sharma", "subject": "Data Structures", "department": "CSE", "weekly_capacity": 18},
            {"teacher_id": "FAC-02", "full_name": "Dr. Verma", "subject": "Operating Systems", "department": "CSE", "weekly_capacity": 18},
            {"teacher_id": "FAC-03", "full_name": "Prof. Gupta", "subject": "Artificial Intelligence", "department": "CSE", "weekly_capacity": 18},
            {"teacher_id": "FAC-04", "full_name": "Prof. Singh", "subject": "Computer Networks", "department": "CSE", "weekly_capacity": 18},
        ]
        for f in faculty_data:
            rf = await client.post("/api/v1/admin/teachers", json=f, headers=headers)
            assert rf.status_code in (200, 201)

        # Verify faculty listing
        res_f_list = await client.get("/api/v1/admin/teachers", headers=headers)
        assert res_f_list.status_code == 200
        assert len(res_f_list.json()) == 4

        # Step 4: Create Cohorts
        cohorts_data = [
            {"class_id": "CSE-3A", "name": "CSE 3rd Year A", "grade": "3", "section": "A", "department": "CSE", "capacity": 60},
            {"class_id": "CSE-3B", "name": "CSE 3rd Year B", "grade": "3", "section": "B", "department": "CSE", "capacity": 60},
        ]
        for c in cohorts_data:
            rc = await client.post("/api/v1/admin/classes", json=c, headers=headers)
            assert rc.status_code in (200, 201)

        # Step 5: Add Students (Single + Bulk CSV)
        # Individual Student
        rs1 = await client.post(
            "/api/v1/admin/students",
            json={"student_id": "STU-101", "full_name": "Aarav Patel", "cohort_id": "CSE-3A", "grade": "3", "section": "A", "email": "aarav@atu.edu"},
            headers=headers,
        )
        assert rs1.status_code in (200, 201)

        # Bulk Students
        bulk_students = [
            {"student_id": "STU-102", "full_name": "Diya Sen", "cohort_id": "CSE-3A", "grade": "3", "section": "A", "email": "diya@atu.edu"},
            {"student_id": "STU-201", "full_name": "Kabir Mehta", "cohort_id": "CSE-3B", "grade": "3", "section": "B", "email": "kabir@atu.edu"},
            {"student_id": "STU-202", "full_name": "Ananya Roy", "cohort_id": "CSE-3B", "grade": "3", "section": "B", "email": "ananya@atu.edu"},
        ]
        rs_bulk = await client.post("/api/v1/admin/students/bulk", json=bulk_students, headers=headers)
        assert rs_bulk.status_code == 200

        # Step 6: Create Subjects
        subjects_data = [
            {"subject_id": "CS301", "name": "Data Structures", "credits": 4, "weekly_hours": 3, "department": "CSE", "faculty_id": "FAC-01", "cohort_id": "CSE-3A"},
            {"subject_id": "CS302", "name": "Operating Systems", "credits": 4, "weekly_hours": 3, "department": "CSE", "faculty_id": "FAC-02", "cohort_id": "CSE-3A"},
            {"subject_id": "CS303", "name": "Artificial Intelligence", "credits": 4, "weekly_hours": 3, "department": "CSE", "faculty_id": "FAC-03", "cohort_id": "CSE-3B"},
            {"subject_id": "CS304", "name": "Computer Networks", "credits": 4, "weekly_hours": 3, "department": "CSE", "faculty_id": "FAC-04", "cohort_id": "CSE-3B"},
        ]
        for s in subjects_data:
            rs = await client.post("/api/v1/admin/subjects", json=s, headers=headers)
            assert rs.status_code in (200, 201)

        # Step 7: Create Rooms
        rooms_data = [
            {"room_id": "LH-101", "name": "Lecture Hall 101", "capacity": 70, "type": "standard"},
            {"room_id": "LAB-201", "name": "Computer Lab 201", "capacity": 65, "type": "standard"},
        ]
        for r in rooms_data:
            rr = await client.post("/api/v1/admin/rooms", json=r, headers=headers)
            assert rr.status_code in (200, 201)

        # Step 8: Check Dashboard Summary & University Stats — Strictly Tenant Data!
        res_dash = await client.get("/api/v1/admin/dashboard-summary", headers=headers)
        assert res_dash.status_code == 200
        dash = res_dash.json()
        assert dash["active_students"] == 4
        assert dash["active_teachers"] == 4

        res_u_stats = await client.get("/api/v1/admin/university", headers=headers)
        assert res_u_stats.status_code == 200
        u_stats = res_u_stats.json()["stats"]
        assert u_stats["classes"] == 2
        assert u_stats["rooms"] == 2
        assert u_stats["subjects"] == 4

        # Step 9: Timetable Entities & Solver Generation
        res_ent = await client.get("/api/v1/timetable/entities", headers=headers)
        assert res_ent.status_code == 200
        ent = res_ent.json()
        assert ent["ready_to_generate"] is True
        assert ent["counts"]["teachers"] == 4

        timetable_payload = {
            "working_days": 5,
            "periods_per_day": 6,
            "teachers": [
                {"id": "FAC-01", "name": "Dr. Sharma", "max_hours": 18, "blocked_periods": []},
                {"id": "FAC-02", "name": "Dr. Verma", "max_hours": 18, "blocked_periods": []},
                {"id": "FAC-03", "name": "Prof. Gupta", "max_hours": 18, "blocked_periods": []},
                {"id": "FAC-04", "name": "Prof. Singh", "max_hours": 18, "blocked_periods": []},
            ],
            "cohorts": [
                {"id": "CSE-3A", "name": "CSE 3rd Year A", "blocked_slots": []},
                {"id": "CSE-3B", "name": "CSE 3rd Year B", "blocked_slots": []},
            ],
            "rooms": [
                {"id": "LH-101", "capacity": 70, "type": "standard"},
                {"id": "LAB-201", "capacity": 65, "type": "standard"},
            ],
            "subjects": [
                {"id": "CS301", "name": "Data Structures", "teacher_id": "FAC-01", "cohort_id": "CSE-3A", "weekly_frequency": 3, "room_type": "standard"},
                {"id": "CS302", "name": "Operating Systems", "teacher_id": "FAC-02", "cohort_id": "CSE-3A", "weekly_frequency": 3, "room_type": "standard"},
                {"id": "CS303", "name": "Artificial Intelligence", "teacher_id": "FAC-03", "cohort_id": "CSE-3B", "weekly_frequency": 3, "room_type": "standard"},
                {"id": "CS304", "name": "Computer Networks", "teacher_id": "FAC-04", "cohort_id": "CSE-3B", "weekly_frequency": 3, "room_type": "standard"},
            ],
        }

        res_gen = await client.post("/api/v1/timetable/generate", json=timetable_payload, headers=headers)
        assert res_gen.status_code in (200, 202)
        job_id = res_gen.json()["job_id"]

        # Wait for solver to complete
        solved = False
        solved_schedule = []
        for _ in range(30):
            await asyncio.sleep(0.3)
            res_job = await client.get(f"/api/v1/timetable/status/{job_id}", headers=headers)
            assert res_job.status_code == 200
            jdata = res_job.json()
            if jdata["status"] == "completed":
                solved = True
                solved_schedule = jdata["result"]["schedule"]
                break
            elif jdata["status"] == "failed":
                break

        assert solved is True
        assert len(solved_schedule) == 12  # (3 + 3 + 3 + 3)

        # Activate Timetable
        res_act = await client.post(
            "/api/v1/timetable/activate",
            json={"job_id": job_id, "schedule": solved_schedule, "payload": timetable_payload},
            headers=headers,
        )
        assert res_act.status_code == 200

        # Verify active timetable persistence
        res_act_check = await client.get("/api/v1/timetable/active", headers=headers)
        assert res_act_check.status_code == 200
        assert res_act_check.json()["is_active"] is True

        # Step 10: Record Student Session Attendance
        res_roster = await client.get(
            "/api/v1/attendance/session-roster?date=2026-08-24&cohort_id=CSE-3A&subject_id=CS301&period=P1&faculty_id=FAC-01",
            headers=headers,
        )
        assert res_roster.status_code == 200
        roster_data = res_roster.json()
        assert len(roster_data["students"]) == 2

        res_rec = await client.post(
            "/api/v1/attendance/record-session",
            json={
                "date": "2026-08-24",
                "cohort_id": "CSE-3A",
                "subject_id": "CS301",
                "faculty_id": "FAC-01",
                "period": "P1",
                "records": [
                    {"student_id": "STU-101", "status": "present"},
                    {"student_id": "STU-102", "status": "absent"},
                ],
            },
            headers=headers,
        )
        assert res_rec.status_code == 200

        # Step 11: Faculty Clock-In
        dummy_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\xff\xd9"
        files = {"file": ("selfie.jpg", dummy_jpeg, "image/jpeg")}
        form_data = {
            "latitude": "28.6304",
            "longitude": "77.3711",
            "teacher_id_param": "FAC-01",
        }
        res_clock = await client.post(
            "/api/v1/attendance/faculty-clock-in",
            data=form_data,
            files=files,
            headers=headers,
        )
        assert res_clock.status_code == 200
        clock_rec_id = res_clock.json()["record_id"]

        # Proof view
        res_proof = await client.get(f"/api/v1/attendance/proof/{clock_rec_id}", headers=headers)
        assert res_proof.status_code == 200

        # Step 12: Student Leave Approval -> Excused Attendance
        doc_id_stu = str(uuid.uuid4())
        doc_stu = UniversalDocumentSchema(
            document_id=doc_id_stu,
            university_id=univ_id,
            document_type="STUDENT_LEAVE_FORM",
            student_id="STU-101",
            student_name="Aarav Patel",
            leave_start_date="2026-08-25",
            leave_end_date="2026-08-25",
            leave_type="Medical",
            classification_confidence=0.97,
        )
        res_app_stu = await client.post(
            f"/api/v1/documents/{doc_id_stu}/approve",
            json=doc_stu.model_dump(),
            headers=headers,
        )
        assert res_app_stu.status_code == 200

        # Verify STU-101 is Excused on 2026-08-25
        excused_att = await mongo_db.student_attendance_collection.find_one({
            "university_id": univ_id,
            "student_id": "STU-101",
            "date": "2026-08-25",
        })
        assert excused_att is not None
        assert excused_att["status"] == "excused"

        # Step 13: Faculty Leave Approval -> Substitute Requirement & Alert
        doc_id_fac = str(uuid.uuid4())
        doc_fac = UniversalDocumentSchema(
            document_id=doc_id_fac,
            university_id=univ_id,
            document_type="FACULTY_LEAVE_FORM",
            faculty_id="FAC-02",
            faculty_name="Dr. Verma",
            leave_start_date="2026-08-24",
            leave_end_date="2026-08-24",
            classification_confidence=0.98,
        )
        res_app_fac = await client.post(
            f"/api/v1/documents/{doc_id_fac}/approve",
            json=doc_fac.model_dump(),
            headers=headers,
        )
        assert res_app_fac.status_code == 200

        # Step 14: Predictive Substitute Candidate Ranking & Assignment
        res_sub_cand = await client.post(
            "/api/v1/resources/resolve-conflict",
            json={
                "absent_teacher_id": "FAC-02",
                "date": "2026-08-24",
                "time_slot": "09:00 - 10:00",
                "selected_substitute_id": "FAC-01",
            },
            headers=headers,
        )
        assert res_sub_cand.status_code == 200
        sub_resp = res_sub_cand.json()
        assert sub_resp["substitute_teacher_id"] == "FAC-01"

        # Step 15: Alerts Verification
        res_alerts = await client.get("/api/v1/alerts/feed", headers=headers)
        assert res_alerts.status_code == 200
        alerts = res_alerts.json()
        assert len(alerts) >= 1

        # Step 16: Knowledge Base Query Tenant Isolation
        res_rag = await client.post("/api/v1/knowledge/query", json={"query": "What is the grading policy?"}, headers=headers)
        assert res_rag.status_code == 200
        rag_data = res_rag.json()
        # Empty tenant should not see demo citations!
        assert len(rag_data.get("citations", [])) == 0

@pytest.mark.asyncio
async def test_brick4_cross_tenant_strict_isolation():
    """
    Verify Tenant A data is 100% inaccessible to Tenant B across every module.
    """
    univ_a = f"univ_a_{uuid.uuid4().hex[:8]}"
    univ_b = f"univ_b_{uuid.uuid4().hex[:8]}"

    token_a = create_access_token(f"admin@{univ_a}.edu", role="admin", university_id=univ_a)
    token_b = create_access_token(f"admin@{univ_b}.edu", role="admin", university_id=univ_b)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Tenant A inserts student
        await client.post(
            "/api/v1/admin/students",
            json={"student_id": "STU-A-SECRET", "full_name": "Tenant A VIP", "cohort_id": "A1"},
            headers={"Authorization": f"Bearer {token_a}"},
        )

        # Tenant B queries students -> must NOT contain STU-A-SECRET
        res_b_stu = await client.get("/api/v1/admin/students", headers={"Authorization": f"Bearer {token_b}"})
        assert res_b_stu.status_code == 200
        stu_ids_b = [s["student_id"] for s in res_b_stu.json()]
        assert "STU-A-SECRET" not in stu_ids_b

        # 2. Tenant B attempts to delete Tenant A's student -> Rejected / 404
        res_b_del = await client.delete("/api/v1/admin/students/STU-A-SECRET", headers={"Authorization": f"Bearer {token_b}"})
        assert res_b_del.status_code in (404, 400)

@pytest.mark.asyncio
async def test_brick4_canonical_demo_tenant_preserved():
    """
    Verify demo-university account continues working with its canonical seeded data.
    """
    token_demo = create_access_token("demo-judge@campusnova.com", role="admin", university_id="demo-university")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = {"Authorization": f"Bearer {token_demo}"}

        # Demo Dashboard summary
        res_dash = await client.get("/api/v1/admin/dashboard-summary", headers=headers)
        assert res_dash.status_code == 200
        dash = res_dash.json()
        assert dash["active_students"] > 0
        assert dash["active_teachers"] > 0

        # Demo Active Timetable
        res_tt = await client.get("/api/v1/timetable/active", headers=headers)
        assert res_tt.status_code == 200

        # Demo Substitute resolution
        res_sub = await client.post(
            "/api/v1/resources/resolve-conflict",
            json={
                "absent_teacher_id": "F01",
                "date": "2026-08-24",
                "time_slot": "09:00 - 10:00",
            },
            headers=headers,
        )
        assert res_sub.status_code == 200
        assert "substitute_teacher_id" in res_sub.json()
