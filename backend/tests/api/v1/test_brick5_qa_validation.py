import pytest
import io
import uuid
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security import create_access_token
from app.services.mongo_service import mongo_db


@pytest.mark.asyncio
async def test_brick5_end_to_end_qa_journey():
    """
    Hostile QA end-to-end journey simulating a complete real-world university lifecycle:
    1. Tenant creation & initial empty state verification
    2. Directory population (Faculty, Cohorts, Students via CSV, Subjects, Rooms)
    3. Dashboard single-source-of-truth verification
    4. CP-SAT Timetable generation & activation
    5. Working-day vs Non-working day attendance lifecycle
    6. Faculty GPS check-in & biometric proof
    7. Document OCR approvals (Student Leave -> Excused, Faculty Leave -> Substitute Alert, Admission -> New Student)
    8. Predictive Substitute ranking & conflict resolution
    9. Knowledge base RAG isolation
    10. Operational alerts feed & resolution
    """
    qa_univ = f"univ_qa_{uuid.uuid4().hex[:8]}"
    token_qa = create_access_token("qa_admin@university.edu", role="admin", university_id=qa_univ)
    headers = {"Authorization": f"Bearer {token_qa}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Step 1: Verify brand new tenant is completely empty
        res_dash = await client.get("/api/v1/admin/dashboard-summary", headers=headers)
        assert res_dash.status_code == 200
        dash = res_dash.json()
        assert dash["active_students"] == 0
        assert dash["active_teachers"] == 0
        assert dash["substitutions_today"] == 0

        res_att_summary = await client.get("/api/v1/admin/attendance/summary?date=2026-08-24", headers=headers)
        assert res_att_summary.status_code == 200
        att_sum = res_att_summary.json()
        assert att_sum["present"] == 0
        assert att_sum["absent"] == 0
        assert att_sum["excused"] == 0

        # Step 2: Configure University Setup
        res_setup = await client.patch(
            "/api/v1/admin/university",
            json={
                "university_name": "QA Technological Institute",
                "short_name": "QATI",
                "academic_year": "2026-2027",
                "working_days_per_week": 5,
                "periods_per_day": 6,
                "start_time": "09:00",
            },
            headers=headers,
        )
        assert res_setup.status_code == 200

        # Step 3: Populate Directory (4 Faculty, 2 Cohorts, 4 Students via CSV, 2 Subjects, 2 Rooms)
        f_ids = []
        for i in range(1, 5):
            fid = f"QA_F0{i}"
            f_ids.append(fid)
            rf = await client.post(
                "/api/v1/admin/teachers",
                json={
                    "teacher_id": fid,
                    "name": f"Prof. QA Faculty {i}",
                    "email": f"faculty{i}@{qa_univ}.edu",
                    "department": "Computer Science",
                    "subject": "Data Systems" if i <= 2 else "Algorithms",
                    "weekly_capacity": 18,
                },
                headers=headers,
            )
            assert rf.status_code in (200, 201)

        cohort_ids = ["QA_CS_A", "QA_CS_B"]
        for cid in cohort_ids:
            rc = await client.post(
                "/api/v1/admin/classes",
                json={
                    "class_id": cid,
                    "name": f"Cohort {cid}",
                    "department": "Computer Science",
                    "grade": "Year 3",
                    "section": "A" if "A" in cid else "B",
                    "capacity": 45,
                },
                headers=headers,
            )
            assert rc.status_code in (200, 201)

        # Bulk student import via CSV
        csv_content = (
            "student_id,name,email,cohort_id,department,grade,section\n"
            f"QA_S01,Alice QA,alice@{qa_univ}.edu,QA_CS_A,Computer Science,Year 3,A\n"
            f"QA_S02,Bob QA,bob@{qa_univ}.edu,QA_CS_A,Computer Science,Year 3,A\n"
            f"QA_S03,Charlie QA,charlie@{qa_univ}.edu,QA_CS_B,Computer Science,Year 3,B\n"
            f"QA_S04,Diana QA,diana@{qa_univ}.edu,QA_CS_B,Computer Science,Year 3,B\n"
        )
        res_bulk = await client.post(
            "/api/v1/admin/students/bulk",
            files={"file": ("students.csv", csv_content.encode("utf-8"), "text/csv")},
            headers=headers,
        )
        assert res_bulk.status_code == 200
        assert res_bulk.json()["successful"] == 4

        # Create Subjects
        await client.post(
            "/api/v1/admin/subjects",
            json={
                "subject_id": "QA_SUB_01",
                "name": "Data Systems",
                "code": "CS301",
                "department": "Computer Science",
                "credits": 3,
                "weekly_hours": 3,
                "teacher_id": f_ids[0],
                "cohort_id": cohort_ids[0],
                "room_type": "lecture",
            },
            headers=headers,
        )
        await client.post(
            "/api/v1/admin/subjects",
            json={
                "subject_id": "QA_SUB_02",
                "name": "Algorithms",
                "code": "CS302",
                "department": "Computer Science",
                "credits": 3,
                "weekly_hours": 3,
                "teacher_id": f_ids[2],
                "cohort_id": cohort_ids[1],
                "room_type": "lecture",
            },
            headers=headers,
        )

        # Create Rooms
        await client.post(
            "/api/v1/admin/rooms",
            json={"room_id": "QA_R101", "name": "Lecture Hall 101", "room_type": "lecture", "capacity": 60},
            headers=headers,
        )
        await client.post(
            "/api/v1/admin/rooms",
            json={"room_id": "QA_R102", "name": "Lecture Hall 102", "room_type": "lecture", "capacity": 60},
            headers=headers,
        )

        # Step 4: Verify Dashboard Single Source of Truth
        res_dash2 = await client.get("/api/v1/admin/dashboard-summary", headers=headers)
        assert res_dash2.status_code == 200
        d2 = res_dash2.json()
        assert d2["active_students"] == 4
        assert d2["active_teachers"] == 4

        # Step 5: CP-SAT Timetable Generation & Activation
        tt_payload = {
            "days_per_week": 5,
            "periods_per_day": 6,
            "teachers": [
                {"id": f_ids[0], "name": "Prof. QA Faculty 1", "max_hours": 18, "blocked_slots": []},
                {"id": f_ids[1], "name": "Prof. QA Faculty 2", "max_hours": 18, "blocked_slots": []},
                {"id": f_ids[2], "name": "Prof. QA Faculty 3", "max_hours": 18, "blocked_slots": []},
                {"id": f_ids[3], "name": "Prof. QA Faculty 4", "max_hours": 18, "blocked_slots": []},
            ],
            "rooms": [
                {"id": "QA_R101", "name": "Lecture Hall 101", "capacity": 60, "room_type": "lecture"},
                {"id": "QA_R102", "name": "Lecture Hall 102", "capacity": 60, "room_type": "lecture"},
            ],
            "cohorts": [
                {"id": "QA_CS_A", "name": "Cohort QA_CS_A", "student_count": 2, "blocked_slots": []},
                {"id": "QA_CS_B", "name": "Cohort QA_CS_B", "student_count": 2, "blocked_slots": []},
            ],
            "subjects": [
                {"id": "QA_SUB_01", "name": "Data Systems", "room_type": "lecture"},
                {"id": "QA_SUB_02", "name": "Algorithms", "room_type": "lecture"},
            ],
            "course_offerings": [
                {
                    "id": "OFF_QA_01",
                    "cohort_id": "QA_CS_A",
                    "subject_id": "QA_SUB_01",
                    "required_weekly_hours": 3,
                    "qualified_teacher_ids": [f_ids[0]],
                },
                {
                    "id": "OFF_QA_02",
                    "cohort_id": "QA_CS_B",
                    "subject_id": "QA_SUB_02",
                    "required_weekly_hours": 3,
                    "qualified_teacher_ids": [f_ids[2]],
                },
            ],
            "hard_constraints": [
                "no_double_booking",
                "max_hours_respected",
                "qualified_faculty_only",
                "room_capacity_respected",
                "blocked_slots_respected",
            ],
            "fixed_slots": [],
            "weight_faculty_gaps": 1.0,
            "weight_subject_spread": 2.0,
        }
        res_tt = await client.post("/api/v1/timetable/generate", json=tt_payload, headers=headers)
        assert res_tt.status_code == 202
        job_id = res_tt.json()["job_id"]

        res_act = await client.post(f"/api/v1/timetable/activate?job_id={job_id}", headers=headers)
        assert res_act.status_code == 200

        res_active_tt = await client.get("/api/v1/timetable/active", headers=headers)
        assert res_active_tt.status_code == 200
        assert res_active_tt.json()["is_active"] is True
        assert len(res_active_tt.json()["schedule"]) > 0

        # Step 6: Non-working day vs Working-day Attendance
        # Sunday 2026-08-23: Should report is_working_day = false
        res_sun = await client.get("/api/v1/attendance/daily-status?date=2026-08-23", headers=headers)
        assert res_sun.status_code == 200
        assert res_sun.json()["is_working_day"] is False
        assert res_sun.json()["total_scheduled_sessions"] == 0

        # Monday 2026-08-24 to Friday 2026-08-28: Working days with solver scheduled sessions
        weekly_scheduled_count = 0
        active_class_date = None
        for day_offset in range(5):
            test_date = (datetime(2026, 8, 24) + timedelta(days=day_offset)).strftime("%Y-%m-%d")
            res_d = await client.get(f"/api/v1/attendance/daily-status?date={test_date}", headers=headers)
            assert res_d.status_code == 200
            assert res_d.json()["is_working_day"] is True
            cnt = res_d.json()["total_scheduled_sessions"]
            weekly_scheduled_count += cnt
            if cnt > 0 and not active_class_date:
                active_class_date = test_date

        assert weekly_scheduled_count == 6  # 3 + 3 hours from CP-SAT solver
        assert active_class_date is not None

        # Record student attendance for QA_CS_A on the active class date
        res_rec = await client.post(
            "/api/v1/attendance/record-session",
            json={
                "date": active_class_date,
                "cohort_id": "QA_CS_A",
                "subject_id": "QA_SUB_01",
                "faculty_id": f_ids[0],
                "period": "P1",
                "records": [
                    {"student_id": "QA_S01", "status": "present"},
                    {"student_id": "QA_S02", "status": "absent"},
                ],
            },
            headers=headers,
        )
        assert res_rec.status_code == 200

        # Fetch session roster
        res_ros = await client.get(
            f"/api/v1/attendance/session-roster?date={active_class_date}&cohort_id=QA_CS_A&subject_id=QA_SUB_01&period=P1",
            headers=headers,
        )
        assert res_ros.status_code == 200
        st_map = {s["student_id"]: s["status"] for s in res_ros.json()["students"]}
        assert st_map["QA_S01"] == "present"
        assert st_map["QA_S02"] == "absent"

        # Step 7: Faculty GPS Check-In & Proof Verification
        dummy_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\xff\xd9"
        res_clock = await client.post(
            "/api/v1/attendance/faculty-clock-in",
            data={
                "latitude": "28.6304",
                "longitude": "77.3711",
                "teacher_id_param": f_ids[0],
            },
            files={"file": ("selfie.jpg", dummy_jpeg, "image/jpeg")},
            headers=headers,
        )
        assert res_clock.status_code == 200
        rec_id = res_clock.json()["record_id"]
        assert rec_id is not None

        # Verify proof streaming
        res_proof = await client.get(f"/api/v1/attendance/proof/{rec_id}", headers=headers)
        assert res_proof.status_code == 200
        assert res_proof.headers["content-type"].startswith("image/")

        # Step 8: Document OCR Approvals
        # 8a: Student Leave Approval -> marks excused
        res_doc_stu = await client.post(
            "/api/v1/documents/process-image",
            files={"file": ("student_leave.jpg", b"Simulated student leave note for QA_S02 on 2026-08-24", "image/jpeg")},
            headers=headers,
        )
        assert res_doc_stu.status_code == 200
        doc_id_stu = res_doc_stu.json()["document_id"]

        res_appr_stu = await client.post(
            f"/api/v1/documents/{doc_id_stu}/approve",
            json={
                "document_type": "STUDENT_LEAVE_APPLICATION",
                "student_id": "QA_S02",
                "student_name": "Bob QA",
                "leave_start_date": active_class_date,
                "leave_end_date": active_class_date,
                "classification_confidence": 0.95,
            },
            headers=headers,
        )
        assert res_appr_stu.status_code == 200

        # Re-fetch roster to verify QA_S02 is now excused
        res_ros2 = await client.get(
            f"/api/v1/attendance/session-roster?date={active_class_date}&cohort_id=QA_CS_A&subject_id=QA_SUB_01&period=P1",
            headers=headers,
        )
        assert res_ros2.status_code == 200
        st_map2 = {s["student_id"]: s["status"] for s in res_ros2.json()["students"]}
        assert st_map2["QA_S02"] == "excused"

        # 8b: Faculty Leave Approval -> creates substitute alert
        res_doc_fac = await client.post(
            "/api/v1/documents/process-image",
            files={"file": ("faculty_leave.jpg", b"Simulated faculty leave note for QA_F01", "image/jpeg")},
            headers=headers,
        )
        assert res_doc_fac.status_code == 200
        doc_id_fac = res_doc_fac.json()["document_id"]

        res_appr_fac = await client.post(
            f"/api/v1/documents/{doc_id_fac}/approve",
            json={
                "document_type": "FACULTY_LEAVE_FORM",
                "faculty_id": f_ids[0],
                "faculty_name": "Prof. QA Faculty 1",
                "leave_start_date": active_class_date,
                "leave_end_date": active_class_date,
                "classification_confidence": 0.96,
            },
            headers=headers,
        )
        assert res_appr_fac.status_code == 200
        assert res_appr_fac.json()["document_type"] == "FACULTY_LEAVE_FORM"

        # 8c: Admission Form Approval -> auto creates student
        res_doc_adm = await client.post(
            "/api/v1/documents/process-image",
            files={"file": ("admission.jpg", b"Simulated admission application for Eve QA in Computer Science", "image/jpeg")},
            headers=headers,
        )
        assert res_doc_adm.status_code == 200
        doc_id_adm = res_doc_adm.json()["document_id"]

        res_appr_adm = await client.post(
            f"/api/v1/documents/{doc_id_adm}/approve",
            json={
                "document_type": "ADMISSION_FORM",
                "applicant_name": "Eve QA",
                "applicant_program": "Computer Science",
                "classification_confidence": 0.98,
            },
            headers=headers,
        )
        assert res_appr_adm.status_code == 200
        assert res_appr_adm.json()["document_type"] == "ADMISSION_FORM"

        # Step 9: Substitute Candidate Ranking & Assignment
        res_cand = await client.get(
            f"/api/v1/resources/available-substitutes?absent_teacher_id={f_ids[0]}&date={active_class_date}&time_slot=09:00 - 10:00",
            headers=headers,
        )
        assert res_cand.status_code == 200
        candidates = res_cand.json()
        assert len(candidates) > 0
        assert all(c["teacher_id"] != f_ids[0] for c in candidates)

        # Assign cover
        res_sub = await client.post(
            "/api/v1/resources/resolve-conflict",
            json={
                "absent_teacher_id": f_ids[0],
                "date": active_class_date,
                "time_slot": "09:00 - 10:00",
                "selected_substitute_id": candidates[0]["teacher_id"],
            },
            headers=headers,
        )
        assert res_sub.status_code == 200

        # Step 10: Knowledge Base RAG Empty State
        res_rag = await client.post(
            "/api/v1/knowledge/query",
            json={"query": "What time does the library close?"},
            headers=headers,
        )
        assert res_rag.status_code == 200
        assert len(res_rag.json()["citations"]) == 0

        # Step 11: Alert Center Feed & Resolution
        res_feed = await client.get("/api/v1/alerts/feed", headers=headers)
        assert res_feed.status_code == 200
        alerts = res_feed.json()
        assert len(alerts) > 0
        target_alert = alerts[0]
        alert_id = target_alert.get("id") or target_alert.get("alert_id")

        if alert_id:
            res_resolve = await client.patch(f"/api/v1/alerts/{alert_id}/resolve", headers=headers)
            assert res_resolve.status_code == 200
            assert res_resolve.json()["status"] == "success" or res_resolve.json().get("state") == "resolved"


@pytest.mark.asyncio
async def test_brick5_cross_tenant_security_boundaries():
    """
    Hostile QA test verifying Tenant B cannot read, edit, or leak any of Tenant A's resources.
    """
    univ_a = f"univ_a_{uuid.uuid4().hex[:6]}"
    univ_b = f"univ_b_{uuid.uuid4().hex[:6]}"

    token_a = create_access_token("admin_a@tenant-a.com", role="admin", university_id=univ_a)
    token_b = create_access_token("admin_b@tenant-b.com", role="admin", university_id=univ_b)

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Create teacher in Tenant A
        await client.post(
            "/api/v1/admin/teachers",
            json={"teacher_id": "TA_F01", "name": "Tenant A Faculty", "email": "ta@univ.edu", "department": "CS"},
            headers=headers_a,
        )

        # Tenant B lists teachers -> Must NOT see Tenant A's teacher
        res_b_teachers = await client.get("/api/v1/admin/teachers", headers=headers_b)
        assert res_b_teachers.status_code == 200
        t_ids_b = [t.get("teacher_id") or t.get("id") for t in res_b_teachers.json()]
        assert "TA_F01" not in t_ids_b

        # Tenant A uploads a document
        res_doc = await client.post(
            "/api/v1/documents/process-image",
            files={"file": ("secret_ta.jpg", b"Confidential document of Tenant A", "image/jpeg")},
            headers=headers_a,
        )
        doc_id = res_doc.json()["document_id"]

        # Tenant B attempts to approve Tenant A's document
        res_b_appr = await client.post(
            f"/api/v1/documents/{doc_id}/approve",
            json={"document_type": "STUDENT_LEAVE_APPLICATION"},
            headers=headers_b,
        )
        assert res_b_appr.status_code in (404, 403, 400)
