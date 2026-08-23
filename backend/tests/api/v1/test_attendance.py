import pytest
import pytest_asyncio
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock, MagicMock
from app.main import app
from app.core.config import settings
from app.core.security import create_access_token
from app.core.limiter import limiter


@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.fixture(autouse=True)
def reset_limiter():
    """Isolate rate-limit counters between tests."""
    limiter._storage.reset()
    yield
    limiter._storage.reset()


def teacher_token():
    return create_access_token("teacher1", "teacher")


def admin_token():
    return create_access_token("admin1", "admin")


# ─────────────────────── faculty-clock-in ────────────────────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.check_liveness", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.mongo_db.faculty_attendance_collection.insert_one", new_callable=AsyncMock)
async def test_faculty_clock_in_success(mock_insert, mock_liveness, mock_find_user, async_client):
    """Valid coordinates + passing liveness → 200."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    mock_liveness.return_value = True
    token = teacher_token()

    data = {"latitude": settings.CAMPUS_LAT, "longitude": settings.CAMPUS_LON}
    files = {"file": ("selfie.jpg", b"fakeimagebytes", "image/jpeg")}

    resp = await async_client.post(
        "/api/v1/attendance/faculty-clock-in",
        data=data, files=files,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
    assert mock_insert.called


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_faculty_clock_in_geofence_fail(mock_find_user, async_client):
    """Coordinates far from campus → 403 Outside Geofence."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    token = teacher_token()

    data = {"latitude": 40.7128, "longitude": -74.0060}  # New York
    files = {"file": ("selfie.jpg", b"fakeimagebytes", "image/jpeg")}

    resp = await async_client.post(
        "/api/v1/attendance/faculty-clock-in",
        data=data, files=files,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 403
    assert resp.json()["detail"] == "Outside Geofence"


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.check_liveness", new_callable=AsyncMock)
async def test_faculty_clock_in_liveness_fail(mock_liveness, mock_find_user, async_client):
    """Failed liveness check → 400 Invalid liveness check."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    mock_liveness.return_value = False
    token = teacher_token()

    data = {"latitude": settings.CAMPUS_LAT, "longitude": settings.CAMPUS_LON}
    files = {"file": ("selfie.jpg", b"fakeimagebytes", "image/jpeg")}

    resp = await async_client.post(
        "/api/v1/attendance/faculty-clock-in",
        data=data, files=files,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid liveness check"


# ─────────────────────── process-sheet ───────────────────────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.extract_attendance_from_image", new_callable=AsyncMock)
async def test_process_sheet_success(mock_extract, mock_find_user, async_client):
    """Valid image + extractable records → 200 with correct count."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    mock_extract.return_value = [
        {"student_id": "S101", "status": "present"},
        {"student_id": "S102", "status": "absent"},
    ]
    token = teacher_token()

    files = {"file": ("attendance.jpg", b"fakeimagebytes", "image/jpeg")}
    data = {"date": "2026-08-11"}

    resp = await async_client.post(
        "/api/v1/attendance/process-sheet",
        data=data, files=files,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
    assert resp.json()["processed_count"] == 2


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_process_sheet_invalid_extension(mock_find_user, async_client):
    """Non-image file type → 400 Invalid file type."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    token = teacher_token()

    files = {"file": ("malicious.exe", b"fakeexe", "application/x-msdownload")}

    resp = await async_client.post(
        "/api/v1/attendance/process-sheet",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid file type"


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.extract_attendance_from_image", new_callable=AsyncMock)
async def test_process_sheet_vision_api_502(mock_extract, mock_find_user, async_client):
    """
    When the Vision API is unavailable, the endpoint must return 502 with a
    sanitized message — never the raw exception string.
    """
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    mock_extract.side_effect = Exception("Connection refused")
    token = teacher_token()

    files = {"file": ("attendance.jpg", b"fakeimagebytes", "image/jpeg")}
    data = {"date": "2026-08-11"}

    # extract_attendance_from_image raises HTTPException(502) on failure
    # We need to simulate that path — patch the actual HTTP call inside the function
    with patch(
        "app.api.v1.endpoints.attendance.extract_attendance_from_image",
        side_effect=__import__("fastapi").HTTPException(
            status_code=502, detail="Vision API is temporarily unavailable"
        ),
    ):
        resp = await async_client.post(
            "/api/v1/attendance/process-sheet",
            data=data, files=files,
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 502
    assert resp.json()["detail"] == "Vision API is temporarily unavailable"


# ─────────────────────── edge-sync ───────────────────────────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.mongo_db.student_attendance_collection.bulk_write", new_callable=AsyncMock)
async def test_edge_sync_success(mock_bulk_write, mock_find_user, async_client):
    """High-confidence records sync; low-confidence records are dropped."""
    mock_find_user.return_value = {"id": "node1", "role": "system_node"}
    token = create_access_token("node1", "system_node")

    payload = {
        "records": [
            {"student_id": "S001", "timestamp": "2026-08-11T09:00:00Z", "status": "present", "confidence_score": 0.95},
            {"student_id": "S002", "timestamp": "2026-08-11T09:00:00Z", "status": "present", "confidence_score": 0.88},
            {"student_id": "S003", "timestamp": "2026-08-11T09:00:00Z", "status": "absent",  "confidence_score": 0.70},  # dropped
        ]
    }

    resp = await async_client.post(
        "/api/v1/attendance/edge-sync",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["synced_records"] == 2
    assert data["dropped_records"] == 1
    assert mock_bulk_write.called


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_edge_sync_rbac_failure(mock_find_user, async_client):
    """Students must not be able to call the edge-sync endpoint."""
    mock_find_user.return_value = {"id": "student1", "role": "student"}
    token = create_access_token("student1", "student")

    payload = {
        "records": [
            {"student_id": "S001", "timestamp": "2026-08-11T09:00:00Z", "status": "present", "confidence_score": 0.95}
        ]
    }

    resp = await async_client.post(
        "/api/v1/attendance/edge-sync",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 403


# ─────────────────────── attendance summary ─────────────────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.admin_erp.mongo_db.student_attendance_collection")
async def test_attendance_summary_success(mock_collection, mock_find_user, async_client):
    """Admin querying the summary endpoint receives grouped aggregation results."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    token = admin_token()

    # Mock the aggregate cursor
    mock_agg_result = [
        {"student_id": "S001", "total": 1, "present": 1, "absent": 0},
        {"student_id": "S002", "total": 1, "present": 0, "absent": 1},
    ]
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=mock_agg_result)
    mock_collection.aggregate.return_value = mock_cursor

    resp = await async_client.get(
        "/api/v1/admin/attendance/summary?date=2026-08-11",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["date"] == "2026-08-11"
    assert data["total_students"] == 2
    assert len(data["records"]) == 2
    assert data["records"][0]["student_id"] == "S001"
    assert data["records"][0]["present"] == 1


@pytest.mark.asyncio
async def test_attendance_summary_rbac_rejects_unauthenticated(async_client):
    """Unauthenticated requests must be rejected with 401."""
    resp = await async_client.get("/api/v1/admin/attendance/summary")
    assert resp.status_code == 401


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_attendance_summary_rbac_rejects_teacher(mock_find_user, async_client):
    """Teachers must not access the admin attendance summary endpoint."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    token = teacher_token()

    resp = await async_client.get(
        "/api/v1/admin/attendance/summary",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 403


# ─────────────────────── process-bulk-register ───────────────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.extract_bulk_attendance_from_image", new_callable=AsyncMock)
@patch("app.services.validation_engine.mongo_db.students_collection.find_one", new_callable=AsyncMock)
@patch("app.services.validation_engine.mongo_db.student_attendance_collection.find_one", new_callable=AsyncMock)
async def test_process_bulk_register_success(mock_att_find, mock_student_find, mock_extract, mock_find_user, async_client):
    """Valid image upload processes bulk register and returns validated rows."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    mock_extract.return_value = {
        "date": "2026-08-11",
        "class_section": "Grade 10-A",
        "records": [
            {"student_id": "S101", "student_name": "Alice", "status": "present"},
            {"student_id": "S102", "student_name": "Bob", "status": "absent"},
        ]
    }
    mock_student_find.side_effect = lambda q: {"student_id": q.get("student_id"), "full_name": "Mock Student"}
    mock_att_find.return_value = None
    token = teacher_token()

    fake_image = b"x" * 6000  # >= 5120 bytes required by process-bulk-register
    files = {"file": ("register.jpg", fake_image, "image/jpeg")}

    resp = await async_client.post(
        "/api/v1/attendance/process-bulk-register",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["date"] == "2026-08-11"
    assert data["total_rows"] == 2
    assert data["valid_rows"] == 2
    assert "batch_id" in data


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_process_bulk_register_invalid_extension(mock_find_user, async_client):
    """Unsupported file extension returns 400."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    token = teacher_token()

    files = {"file": ("sheet.exe", b"fakebytes", "application/x-msdownload")}

    resp = await async_client.post(
        "/api/v1/attendance/process-bulk-register",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 400


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.mongo_db.teachers_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.mongo_db.faculty_attendance_collection.insert_one", new_callable=AsyncMock)
async def test_faculty_clock_in_no_api_key_fallback(mock_insert, mock_find_teacher, mock_find_user, async_client):
    """Faculty clock in succeeds with local fallback when OPENROUTER_API_KEY is not set."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    mock_find_teacher.return_value = {"teacher_id": "T1", "email": "teacher1@campusnova.app"}
    token = teacher_token()

    data = {"latitude": settings.CAMPUS_LAT, "longitude": settings.CAMPUS_LON}
    files = {"file": ("selfie.jpg", b"fakeimagebytes", "image/jpeg")}

    with patch("app.core.config.settings.OPENROUTER_API_KEY", None):
        resp = await async_client.post(
            "/api/v1/attendance/faculty-clock-in",
            data=data, files=files,
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200
    assert resp.json()["status"] == "success"


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.extract_bulk_attendance_from_image", new_callable=AsyncMock)
@patch("app.services.validation_engine.mongo_db.students_collection.find_one", new_callable=AsyncMock)
@patch("app.services.validation_engine.mongo_db.student_attendance_collection.find_one", new_callable=AsyncMock)
async def test_process_bulk_register_pdf_success(mock_att_find, mock_student_find, mock_extract, mock_find_user, async_client):
    """PDF upload is converted to image and processed successfully."""
    import pymupdf
    doc = pymupdf.open()
    page = doc.new_page(width=200, height=200)
    page.insert_text((20, 50), "Attendance Sheet\nS101: Present")
    pdf_bytes = doc.tobytes()
    doc.close()

    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    mock_extract.return_value = {
        "date": "2026-08-11",
        "class_section": "Grade 10-A",
        "records": [
            {"student_id": "S101", "student_name": "Alice", "status": "present"}
        ]
    }
    mock_student_find.side_effect = lambda q: {"student_id": q.get("student_id"), "full_name": "Mock Student"}
    mock_att_find.return_value = None
    token = teacher_token()

    files = {"file": ("register.pdf", pdf_bytes, "application/pdf")}

    resp = await async_client.post(
        "/api/v1/attendance/process-bulk-register",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["date"] == "2026-08-11"
    assert data["total_rows"] == 1


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.mongo_db.teachers_collection.find")
@patch("app.api.v1.endpoints.attendance.mongo_db.faculty_attendance_collection.find")
async def test_faculty_attendance_summary(mock_att_find, mock_tch_find, mock_find_user, async_client):
    """Admin/Teacher can fetch date-filtered faculty attendance with proof metadata."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    token = admin_token()

    mock_tch_find.return_value.to_list = AsyncMock(return_value=[
        {"teacher_id": "TCH-001", "full_name": "Dr. Sharma", "subject": "Math"},
        {"teacher_id": "TCH-002", "full_name": "Ms. Verma", "subject": "Physics"},
    ])

    mock_att_find.return_value.to_list = AsyncMock(return_value=[
        {
            "record_id": "rec-123",
            "teacher_id": "TCH-001",
            "date": "2026-08-21",
            "timestamp": datetime(2026, 8, 21, 9, 2, tzinfo=timezone.utc),
            "location_verified": True,
            "distance_meters": 45.2,
            "liveness_verified": True,
            "status": "present"
        }
    ])

    resp = await async_client.get(
        "/api/v1/attendance/faculty-summary?date=2026-08-21",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["date"] == "2026-08-21"
    assert data["total_faculty"] == 2
    assert data["present_count"] == 1
    assert data["unmarked_count"] == 1
    
    records = data["records"]
    r1 = next(r for r in records if r["teacher_id"] == "TCH-001")
    assert r1["status"] == "present"
    assert r1["proof_url"] == "/api/v1/attendance/proof/rec-123"
    assert r1["location_verified"] is True

    r2 = next(r for r in records if r["teacher_id"] == "TCH-002")
    assert r2["status"] == "unmarked"
    assert r2["proof_url"] is None


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.mongo_db.faculty_attendance_collection.find_one", new_callable=AsyncMock)
async def test_get_attendance_proof_not_found(mock_find_doc, mock_find_user, async_client):
    """Non-existent proof record returns 404."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    token = admin_token()
    mock_find_doc.return_value = None

    resp = await async_client.get(
        "/api/v1/attendance/proof/nonexistent-id",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404



