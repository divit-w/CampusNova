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
    mock_find_dup.return_value = None   # No duplicate

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
    mock_find_dup.return_value = {"student_id": "S001"}   # Duplicate exists

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


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.admin_erp.mongo_db.students_collection.find", new_callable=MagicMock)
async def test_admin_list_students(mock_find, mock_find_user, async_client):
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[
        {"student_id": "S001", "full_name": "Alice Sharma", "grade": "10", "section": "A", "email": "alice@campus.edu"},
    ])
    mock_find.return_value = mock_cursor

    resp = await async_client.get(
        "/api/v1/admin/students",
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1


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
        {
            "class_id": "C101", "teacher_id": "teacher1", "subject": "Math",
            "schedule_time": "09:00", "grade": "10", "section": "A"
        },
        {
            "class_id": "C102", "teacher_id": "teacher2", "subject": "Science",
            "schedule_time": "11:00", "grade": "10", "section": "A"
        },
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
