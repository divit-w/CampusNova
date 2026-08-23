import pytest
import pytest_asyncio
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.api.v1.deps import get_current_user


@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.mark.asyncio
async def test_empty_tenant_initial_state(async_client):
    univ_id = f"univ_empty_{uuid.uuid4().hex[:6]}"
    user_context = {
        "id": f"admin_{uuid.uuid4().hex[:6]}",
        "email": "admin@newuniv.edu",
        "role": "admin",
        "university_id": univ_id,
        "university_name": None,
        "is_demo": False,
        "is_setup_complete": False,
    }
    app.dependency_overrides[get_current_user] = lambda: user_context
    try:
        res = await async_client.get("/api/v1/admin/university")
        assert res.status_code == 200
        data = res.json()
        assert data["stats"]["students"] == 0
        assert data["stats"]["teachers"] == 0
        assert data["stats"]["classes"] == 0
        assert data["stats"]["subjects"] == 0
        assert data["stats"]["rooms"] == 0
        assert data["stats"]["has_active_timetable"] is False
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_dynamic_directory_crud_and_cross_tenant_isolation(async_client):
    univ_a = f"univ_a_{uuid.uuid4().hex[:6]}"
    univ_b = f"univ_b_{uuid.uuid4().hex[:6]}"

    user_a = {"id": "admin_a", "role": "admin", "university_id": univ_a, "is_demo": False}
    user_b = {"id": "admin_b", "role": "admin", "university_id": univ_b, "is_demo": False}

    # 1. Tenant A creates entities
    app.dependency_overrides[get_current_user] = lambda: user_a
    try:
        t_res = await async_client.post("/api/v1/admin/teachers", json={
            "teacher_id": "FAC_A_01",
            "full_name": "Prof. Alice A",
            "department": "Computer Science",
            "subjects": ["AI", "Databases"],
            "max_hours": 16,
        })
        assert t_res.status_code == 201

        c_res = await async_client.post("/api/v1/admin/classes", json={
            "class_id": "COHORT_A_1",
            "name": "CS Year 1",
            "department": "Computer Science",
            "grade": "1st Year",
            "section": "A",
            "capacity": 35,
        })
        assert c_res.status_code == 201

        s_res = await async_client.post("/api/v1/admin/students", json={
            "student_id": "STU_A_001",
            "full_name": "Student Alpha",
            "cohort_id": "COHORT_A_1",
            "grade": "1st Year",
            "section": "A",
        })
        assert s_res.status_code == 201

        sub_res = await async_client.post("/api/v1/admin/subjects", json={
            "subject_id": "SUB_A_101",
            "name": "Artificial Intelligence",
            "code": "CS-101",
            "department": "Computer Science",
            "credits": 4,
            "required_weekly_hours": 3,
        })
        assert sub_res.status_code == 201

        r_res = await async_client.post("/api/v1/admin/rooms", json={
            "room_id": "ROOM_A_101",
            "name": "Lab A-101",
            "room_type": "lab",
            "capacity": 40,
        })
        assert r_res.status_code == 201

        # Verify Tenant A sees entities
        t_list = await async_client.get("/api/v1/admin/teachers")
        assert len(t_list.json()) == 1

        c_list = await async_client.get("/api/v1/admin/classes")
        assert len(c_list.json()) == 1

        s_list = await async_client.get("/api/v1/admin/students")
        assert len(s_list.json()) == 1

        sub_list = await async_client.get("/api/v1/admin/subjects")
        assert len(sub_list.json()) == 1

        r_list = await async_client.get("/api/v1/admin/rooms")
        assert len(r_list.json()) == 1
    finally:
        app.dependency_overrides.clear()

    # 2. ISOLATION CHECK: Tenant B queries same endpoints -> 0 records
    app.dependency_overrides[get_current_user] = lambda: user_b
    try:
        t_b = await async_client.get("/api/v1/admin/teachers")
        assert len(t_b.json()) == 0

        c_b = await async_client.get("/api/v1/admin/classes")
        assert len(c_b.json()) == 0

        s_b = await async_client.get("/api/v1/admin/students")
        assert len(s_b.json()) == 0

        sub_b = await async_client.get("/api/v1/admin/subjects")
        assert len(sub_b.json()) == 0

        r_b = await async_client.get("/api/v1/admin/rooms")
        assert len(r_b.json()) == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_bulk_student_import_validation(async_client):
    univ_id = f"univ_bulk_{uuid.uuid4().hex[:6]}"
    user = {"id": "admin_bulk", "role": "admin", "university_id": univ_id, "is_demo": False}
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        csv_payload = (
            "student_id,full_name,cohort_id,grade,section,email\n"
            "STU_BULK_1,Bob Miller,CS-1,1st Year,A,bob@test.edu\n"
            "STU_BULK_2,Charlie Day,CS-1,1st Year,A,charlie@test.edu\n"
            "STU_BULK_3,Diana Prince,CS-1,1st Year,A,diana@test.edu\n"
        )
        files = {"file": ("students.csv", csv_payload.encode("utf-8"), "text/csv")}
        res = await async_client.post("/api/v1/admin/students/bulk", files=files)
        assert res.status_code == 200
        data = res.json()
        assert data["imported_count"] == 3
        assert data["duplicate_count"] == 0

        # Duplicate import
        res_dup = await async_client.post("/api/v1/admin/students/bulk", files=files)
        assert res_dup.status_code == 200
        assert res_dup.json()["imported_count"] == 0
        assert res_dup.json()["duplicate_count"] == 3
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_timetable_entities_preflight_and_activation(async_client):
    univ_id = f"univ_tt_{uuid.uuid4().hex[:6]}"
    user = {"id": "admin_tt", "role": "admin", "university_id": univ_id, "is_demo": False}
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        # Pre-flight on empty tenant -> ready_to_generate is False
        empty_check = await async_client.get("/api/v1/timetable/entities")
        assert empty_check.status_code == 200
        assert empty_check.json()["ready_to_generate"] is False
        assert len(empty_check.json()["missing_requirements"]) > 0

        # Add 1 of each entity
        await async_client.post("/api/v1/admin/teachers", json={"teacher_id": "T01", "full_name": "Prof T", "subjects": ["Math"]})
        await async_client.post("/api/v1/admin/classes", json={"class_id": "C01", "name": "Class 1"})
        await async_client.post("/api/v1/admin/subjects", json={"subject_id": "S01", "name": "Math"})
        await async_client.post("/api/v1/admin/rooms", json={"room_id": "R01", "name": "Room 1"})

        # Pre-flight again -> ready_to_generate is True
        ready_check = await async_client.get("/api/v1/timetable/entities")
        assert ready_check.status_code == 200
        assert ready_check.json()["ready_to_generate"] is True

        # Activate timetable
        act_res = await async_client.post(
            "/api/v1/timetable/activate",
            json={
                "schedule": [
                    {"day": 0, "period": 0, "teacher_id": "T01", "cohort_id": "C01", "subject_id": "S01", "room_id": "R01"}
                ]
            }
        )
        assert act_res.status_code == 200

        # Check Active Timetable
        active = await async_client.get("/api/v1/timetable/active")
        assert active.status_code == 200
        assert active.json()["is_active"] is True
        assert len(active.json()["schedule"]) == 1

        # Check Dashboard reflects active timetable
        dash = await async_client.get("/api/v1/admin/dashboard-summary")
        assert dash.status_code == 200
        assert dash.json()["timetable_status"] == "active"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_document_ocr_approval_operational_workflows(async_client):
    univ_id = f"univ_ocr_{uuid.uuid4().hex[:6]}"
    user = {"id": "admin_ocr", "role": "admin", "university_id": univ_id, "is_demo": False}
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        # Pre-create student and teacher
        await async_client.post("/api/v1/admin/teachers", json={"teacher_id": "F_OCR_1", "full_name": "Dr. OCR Teacher", "subjects": ["CS"]})
        await async_client.post("/api/v1/admin/classes", json={"class_id": "CS_OCR_1", "name": "CS 1"})
        await async_client.post("/api/v1/admin/students", json={"student_id": "STU_OCR_1", "full_name": "Student OCR", "cohort_id": "CS_OCR_1"})

        # 1. Student Leave Approval -> Attendance Excused
        leave_doc_id = f"doc_{uuid.uuid4().hex[:6]}"
        res_leave = await async_client.post(f"/api/v1/documents/{leave_doc_id}/approve", json={
            "document_type": "STUDENT_LEAVE_FORM",
            "document_category": "Student Leave Application",
            "student_name": "Student OCR",
            "student_id": "STU_OCR_1",
            "leave_start_date": "2026-08-25",
            "leave_end_date": "2026-08-26",
            "summary": "Medical leave",
            "extracted_fields": [],
            "requires_human_review": False,
        })
        assert res_leave.status_code == 200
        assert len(res_leave.json()["excused_dates"]) == 2

        # 2. Faculty Leave Approval -> Absence Log + Alert
        fac_doc_id = f"doc_fac_{uuid.uuid4().hex[:6]}"
        res_fac = await async_client.post(f"/api/v1/documents/{fac_doc_id}/approve", json={
            "document_type": "FACULTY_LEAVE_FORM",
            "document_category": "Faculty Leave Form",
            "faculty_name": "Dr. OCR Teacher",
            "faculty_id": "F_OCR_1",
            "leave_start_date": "2026-08-24",
            "summary": "Conference leave",
            "extracted_fields": [],
            "requires_human_review": True,
        })
        assert res_fac.status_code == 200
        assert "substitute_route" in res_fac.json()

        # 3. Admission Form Approval -> Auto-register new student
        adm_doc_id = f"doc_adm_{uuid.uuid4().hex[:6]}"
        res_adm = await async_client.post(f"/api/v1/documents/{adm_doc_id}/approve", json={
            "document_type": "ADMISSION_FORM",
            "document_category": "Admission Application",
            "applicant_name": "Newbie Candidate",
            "applicant_program": "Computer Science",
            "summary": "Admissions",
            "extracted_fields": [],
            "requires_human_review": True,
        })
        assert res_adm.status_code == 200
        assert "student_id" in res_adm.json()

        # Check student roster contains newly admitted candidate
        students_res = await async_client.get("/api/v1/admin/students")
        students = students_res.json()
        assert any(s["full_name"] == "Newbie Candidate" for s in students)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_operational_alerts_persistence_and_resolution(async_client):
    univ_a = f"univ_alt_a_{uuid.uuid4().hex[:6]}"
    univ_b = f"univ_alt_b_{uuid.uuid4().hex[:6]}"

    user_a = {"id": "admin_alt_a", "role": "admin", "university_id": univ_a, "is_demo": False}
    user_b = {"id": "admin_alt_b", "role": "admin", "university_id": univ_b, "is_demo": False}

    app.dependency_overrides[get_current_user] = lambda: user_a
    try:
        # Trigger an alert by activating timetable
        await async_client.post("/api/v1/timetable/activate", json={
            "schedule": [{"day": 0, "period": 0, "teacher_id": "T1", "cohort_id": "C1", "subject_id": "S1", "room_id": "R1"}]
        })
        alerts_res = await async_client.get("/api/v1/alerts/history")
        alerts_a = alerts_res.json()
        assert len(alerts_a) >= 1
        alt_id = alerts_a[0]["alert_id"]

        # Resolve alert
        res_resolve = await async_client.patch(f"/api/v1/alerts/{alt_id}/resolve")
        assert res_resolve.status_code == 200
        assert res_resolve.json()["state"] == "resolved"
    finally:
        app.dependency_overrides.clear()

    # Verify Tenant B sees 0 alerts
    app.dependency_overrides[get_current_user] = lambda: user_b
    try:
        alerts_b_res = await async_client.get("/api/v1/alerts/history")
        alerts_b = alerts_b_res.json()
        assert len(alerts_b) == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_demo_account_preservation(async_client):
    user_demo = {"id": "demo-admin", "role": "admin", "university_id": "demo-university", "is_demo": True}
    app.dependency_overrides[get_current_user] = lambda: user_demo
    try:
        res = await async_client.get("/api/v1/admin/teachers")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()
