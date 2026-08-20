import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock
from app.main import app
from app.core.config import settings

@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

def get_auth_token():
    from app.core.security import create_access_token
    return create_access_token("teacher1", "teacher")

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.check_liveness", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.mongo_db.faculty_attendance_collection.insert_one", new_callable=AsyncMock)
async def test_faculty_clock_in_success(mock_insert, mock_liveness, mock_find_user, async_client):
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    mock_liveness.return_value = True
    token = get_auth_token()
    
    # Coordinates exactly at campus
    data = {
        "latitude": settings.CAMPUS_LAT,
        "longitude": settings.CAMPUS_LON
    }
    
    files = {"file": ("selfie.jpg", b"fakeimagebytes", "image/jpeg")}
    
    resp = await async_client.post("/api/v1/attendance/faculty-clock-in", data=data, files=files, headers={"Authorization": f"Bearer {token}"})
    
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
    assert mock_insert.called

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_faculty_clock_in_geofence_fail(mock_find_user, async_client):
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    token = get_auth_token()
    
    # Coordinates far from campus (e.g. New York when campus is in Noida)
    data = {
        "latitude": 40.7128,
        "longitude": -74.0060
    }
    files = {"file": ("selfie.jpg", b"fakeimagebytes", "image/jpeg")}
    
    resp = await async_client.post("/api/v1/attendance/faculty-clock-in", data=data, files=files, headers={"Authorization": f"Bearer {token}"})
    
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Outside Geofence"

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.check_liveness", new_callable=AsyncMock)
async def test_faculty_clock_in_liveness_fail(mock_liveness, mock_find_user, async_client):
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    mock_liveness.return_value = False
    token = get_auth_token()
    
    data = {
        "latitude": settings.CAMPUS_LAT,
        "longitude": settings.CAMPUS_LON
    }
    files = {"file": ("selfie.jpg", b"fakeimagebytes", "image/jpeg")}
    
    resp = await async_client.post("/api/v1/attendance/faculty-clock-in", data=data, files=files, headers={"Authorization": f"Bearer {token}"})
    
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid liveness check"

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.extract_attendance_from_image", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.mongo_db.student_attendance_collection.bulk_write", new_callable=AsyncMock)
async def test_process_sheet_success(mock_bulk_write, mock_extract, mock_find_user, async_client):
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    token = get_auth_token()
    
    mock_extract.return_value = [
        {"student_id": "S101", "status": "present"},
        {"student_id": "S102", "status": "absent"}
    ]
    
    files = {"file": ("attendance.jpg", b"fakeimagebytes", "image/jpeg")}
    data = {"date": "2026-08-11"}
    
    resp = await async_client.post("/api/v1/attendance/process-sheet", data=data, files=files, headers={"Authorization": f"Bearer {token}"})
    
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
    assert resp.json()["processed_count"] == 2
    assert mock_bulk_write.called

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_process_sheet_invalid_extension(mock_find_user, async_client):
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    token = get_auth_token()
    
    files = {"file": ("malicious.exe", b"fakeexe", "application/x-msdownload")}
    
    resp = await async_client.post("/api/v1/attendance/process-sheet", files=files, headers={"Authorization": f"Bearer {token}"})
    
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid file type"

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.mongo_db.student_attendance_collection.bulk_write", new_callable=AsyncMock)
async def test_edge_sync_success(mock_bulk_write, mock_find_user, async_client):
    mock_find_user.return_value = {"id": "node1", "role": "system_node"}
    token = get_auth_token() # the actual token doesn't matter much as long as role is authorized in mock
    
    payload = {
        "records": [
            {"student_id": "S001", "timestamp": "2026-08-11T09:00:00Z", "status": "present", "confidence_score": 0.95},
            {"student_id": "S002", "timestamp": "2026-08-11T09:00:00Z", "status": "present", "confidence_score": 0.88},
            {"student_id": "S003", "timestamp": "2026-08-11T09:00:00Z", "status": "absent", "confidence_score": 0.70} # Should drop
        ]
    }
    
    resp = await async_client.post("/api/v1/attendance/edge-sync", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["synced_records"] == 2
    assert data["dropped_records"] == 1
    assert mock_bulk_write.called

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_edge_sync_rbac_failure(mock_find_user, async_client):
    # Simulate a student trying to hit the edge sync endpoint
    mock_find_user.return_value = {"id": "student1", "role": "student"}
    from app.core.security import create_access_token
    token = create_access_token("student1", "student")
    
    payload = {
        "records": [
            {"student_id": "S001", "timestamp": "2026-08-11T09:00:00Z", "status": "present", "confidence_score": 0.95}
        ]
    }
    
    resp = await async_client.post("/api/v1/attendance/edge-sync", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
