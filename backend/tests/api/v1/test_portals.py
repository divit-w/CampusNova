import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock, MagicMock
from app.main import app
from app.core.security import create_access_token


@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


def admin_token():
    return create_access_token("admin1", "admin")


def teacher_token():
    return create_access_token("teacher1", "teacher")


def student_token():
    return create_access_token("student1", "student")


# ──────────────────────────── Admin CRUD ──────────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.admin_erp.mongo_db.students_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.admin_erp.mongo_db.students_collection.insert_one", new_callable=AsyncMock)
async def test_admin_create_student_success(mock_insert, mock_find_dup, mock_find_user, async_client):
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    mock_find_dup.return_value = None

    payload = {
        "student_id": "S001",
        "full_name": "Alice Sharma",
        "grade": "10",
        "section": "A",
        "email": "alice@campus.edu",
    }
    resp = await async_client.post(
        "/api/v1/admin/students",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["student_id"] == "S001"
    assert data["full_name"] == "Alice Sharma"
    assert mock_insert.called


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.admin_erp.mongo_db.students_collection.find_one", new_callable=AsyncMock)
async def test_admin_create_student_duplicate(mock_find_dup, mock_find_user, async_client):
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    mock_find_dup.return_value = {"student_id": "S001"}

    payload = {
        "student_id": "S001",
        "full_name": "Bob Gupta",
        "grade": "10",
        "section": "A",
        "email": "bob@campus.edu",
    }
    resp = await async_client.post(
        "/api/v1/admin/students",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 409


def _make_paginated_cursor(records: list) -> MagicMock:
    """
    Build a mock Motor cursor that correctly chains .skip().limit()
    and returns `records` from .to_list(). Motor cursors return `self`
    from skip/limit so the chain is fluent.
    """
    mock_cursor = MagicMock()
    mock_cursor.skip.return_value = mock_cursor
    mock_cursor.limit.return_value = mock_cursor
    mock_cursor.to_list = AsyncMock(return_value=records)
    return mock_cursor


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.admin_erp.mongo_db.students_collection.find", new_callable=MagicMock)
async def test_admin_list_students(mock_find, mock_find_user, async_client):
    """Default pagination (skip=0, limit=50) returns bounded results."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    mock_find.return_value = _make_paginated_cursor([
        {"student_id": "S001", "full_name": "Alice Sharma", "grade": "10", "section": "A", "email": "alice@campus.edu"},
    ])

    resp = await async_client.get(
        "/api/v1/admin/students",
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.admin_erp.mongo_db.students_collection.find", new_callable=MagicMock)
async def test_admin_list_students_pagination(mock_find, mock_find_user, async_client):
    """
    Pagination parameters are forwarded to the Motor cursor.
    skip=5&limit=2 → cursor.skip(5).limit(2) must be called,
    and the response must contain exactly what the cursor returns.
    """
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    page_2_records = [
        {"student_id": "S006", "full_name": "Student 6", "grade": "10", "section": "A", "email": "s6@campus.edu"},
        {"student_id": "S007", "full_name": "Student 7", "grade": "10", "section": "A", "email": "s7@campus.edu"},
    ]
    mock_cursor = _make_paginated_cursor(page_2_records)
    mock_find.return_value = mock_cursor

    resp = await async_client.get(
        "/api/v1/admin/students?skip=5&limit=2",
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["student_id"] == "S006"
    assert data[1]["student_id"] == "S007"
    # Verify skip and limit were forwarded to the cursor
    mock_cursor.skip.assert_called_once_with(5)
    mock_cursor.limit.assert_called_once_with(2)


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_admin_list_students_limit_exceeds_max(mock_find_user, async_client):
    """limit > 100 must be rejected with 422 Unprocessable Entity by Pydantic validation."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}

    resp = await async_client.get(
        "/api/v1/admin/students?limit=999",
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 422


# ──────────────────────────── Teacher Portal ──────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.portals.mongo_db.classes_collection.find", new_callable=MagicMock)
async def test_teacher_my_classes(mock_find, mock_find_user, async_client):
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[
        {
            "class_id": "C101", "teacher_id": "teacher1", "subject": "Math",
            "schedule_time": "09:00", "grade": "10", "section": "A"
        },
    ])
    mock_find.return_value = mock_cursor

    resp = await async_client.get(
        "/api/v1/portals/teacher/my-classes",
        headers={"Authorization": f"Bearer {teacher_token()}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["subject"] == "Math"


# ──────────────────────────── Student Portal ──────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.portals.mongo_db.students_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.portals.mongo_db.classes_collection.find", new_callable=MagicMock)
async def test_student_my_schedule(mock_classes_find, mock_student_find, mock_find_user, async_client):
    mock_find_user.return_value = {"id": "student1", "role": "student"}
    mock_student_find.return_value = {
        "student_id": "student1", "full_name": "Alice", "grade": "10", "section": "A", "email": "a@campus.edu"
    }
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[
        {"class_id": "C101", "teacher_id": "teacher1", "subject": "Math",
         "schedule_time": "09:00", "grade": "10", "section": "A"},
        {"class_id": "C102", "teacher_id": "teacher2", "subject": "Science",
         "schedule_time": "11:00", "grade": "10", "section": "A"},
    ])
    mock_classes_find.return_value = mock_cursor

    resp = await async_client.get(
        "/api/v1/portals/student/my-schedule",
        headers={"Authorization": f"Bearer {student_token()}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[1]["subject"] == "Science"


# ──────────────────────────── RBAC Failures ───────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_student_cannot_access_admin_endpoint(mock_find_user, async_client):
    """Student token hitting admin POST /students must get 403."""
    mock_find_user.return_value = {"id": "student1", "role": "student"}
    payload = {
        "student_id": "S999",
        "full_name": "Hacker",
        "grade": "12",
        "section": "Z",
        "email": "hack@campus.edu",
    }
    resp = await async_client.post(
        "/api/v1/admin/students",
        json=payload,
        headers={"Authorization": f"Bearer {student_token()}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_teacher_cannot_access_student_portal(mock_find_user, async_client):
    """Teacher token hitting student schedule must get 403."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    resp = await async_client.get(
        "/api/v1/portals/student/my-schedule",
        headers={"Authorization": f"Bearer {teacher_token()}"},
    )
    assert resp.status_code == 403


# ──────────────────────────── 413 Middleware ─────────────────────────────────

@pytest.mark.asyncio
async def test_413_payload_too_large(async_client):
    """
    Requests declaring Content-Length > 10 MB must receive 413 Payload Too Large
    before the body is parsed — the ContentSizeLimitMiddleware fires first.
    """
    oversized = 11 * 1024 * 1024  # 11 MB — exceeds 10 MB cap

    resp = await async_client.post(
        "/api/v1/attendance/faculty-clock-in",
        content=b"x",  # Actual body is small — we declare a large Content-Length
        headers={
            "Content-Length": str(oversized),
            "Content-Type": "application/octet-stream",
        },
    )
    assert resp.status_code == 413
    assert "Payload Too Large" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_normal_payload_not_rejected(async_client):
    """Requests within the 10 MB limit must pass through the middleware unaffected."""
    # Health check has no auth requirement; a small request should always pass the size middleware
    resp = await async_client.get("/health")
    assert resp.status_code == 200


# ──────────────────── Student Profile Integrity ──────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.portals.mongo_db.students_collection.find_one", new_callable=AsyncMock)
async def test_student_schedule_missing_grade_returns_400(mock_student_find, mock_find_user, async_client):
    """
    Regression test for the KeyError bug:
    A student document missing the 'grade' field must return 400 Bad Request,
    not crash with a KeyError 500.
    """
    mock_find_user.return_value = {"id": "student1", "role": "student"}
    # Intentionally missing 'grade' — only 'section' is present
    mock_student_find.return_value = {
        "student_id": "student1",
        "full_name": "Incomplete Student",
        "section": "A",
        "email": "incomplete@campus.edu",
        # 'grade' is intentionally absent — simulates an incomplete DB record
    }

    resp = await async_client.get(
        "/api/v1/portals/student/my-schedule",
        headers={"Authorization": f"Bearer {student_token()}"},
    )
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.json()}"
    assert "incomplete" in resp.json()["detail"].lower()
    assert "grade" in resp.json()["detail"].lower()
