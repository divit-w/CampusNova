"""
Security hardening tests: rate limiting (429) and CORS headers.

slowapi uses an in-memory storage keyed by IP. To make the rate limit test
deterministic and isolated from other tests, we:
  1. Use a unique private IP per test via X-Forwarded-For.
  2. Reset the limiter's storage before the test to guarantee a clean slate.
"""
import pytest
import pytest_asyncio
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.limiter import limiter
from app.core.security import create_access_token


@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.fixture(autouse=True)
def reset_limiter():
    """Wipe the in-memory rate limit storage before every test in this module."""
    limiter._storage.reset()
    yield
    limiter._storage.reset()


def admin_token():
    return create_access_token("admin1", "admin")


def teacher_token():
    return create_access_token("teacher1", "teacher")


# ───────────────── ERP rate-limit: 10/minute ──────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.services.nlp_service.erp_agent.run", new_callable=AsyncMock)
async def test_erp_rate_limit_429(mock_run, mock_find_user, async_client):
    """The 11th request within a minute from the same IP must return 429."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    mock_run.return_value = {
        "action_type": "find",
        "target_collection": "students",
        "results": [],
    }

    token = admin_token()
    headers = {
        "Authorization": f"Bearer {token}",
        # Force a dedicated test IP so this test is isolated from any other
        "X-Forwarded-For": "10.0.0.1",
    }
    payload = {"query": "List all students"}

    # First 10 calls must succeed
    for i in range(10):
        resp = await async_client.post("/api/v1/erp/prompt", json=payload, headers=headers)
        assert resp.status_code == 200, f"Expected 200 on call {i+1}, got {resp.status_code}"

    # 11th call must be rate-limited
    resp = await async_client.post("/api/v1/erp/prompt", json=payload, headers=headers)
    assert resp.status_code == 429, f"Expected 429 on 11th call, got {resp.status_code}"


# ──────────────── process-sheet rate-limit: 5/minute ──────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.extract_attendance_from_image", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.attendance.mongo_db.student_attendance_collection.bulk_write", new_callable=AsyncMock)
async def test_process_sheet_rate_limit_429(mock_bulk, mock_extract, mock_find_user, async_client):
    """The 6th request within a minute from the same IP must return 429."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    mock_extract.return_value = [{"student_id": "S001", "status": "present"}]

    token = teacher_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Forwarded-For": "10.0.0.2",
    }
    files = {"file": ("sheet.jpg", b"fakeimage", "image/jpeg")}
    data = {"date": "2026-08-11"}

    # First 5 calls must succeed
    for i in range(5):
        resp = await async_client.post(
            "/api/v1/attendance/process-sheet",
            data=data,
            files=files,
            headers=headers,
        )
        assert resp.status_code == 200, f"Expected 200 on call {i+1}, got {resp.status_code}"

    # 6th call must be rate-limited
    resp = await async_client.post(
        "/api/v1/attendance/process-sheet",
        data=data,
        files=files,
        headers=headers,
    )
    assert resp.status_code == 429, f"Expected 429 on 6th call, got {resp.status_code}"


# ──────────────── CORS headers are present on responses ───────────

@pytest.mark.asyncio
async def test_cors_headers_present(async_client):
    """OPTIONS preflight on any endpoint should return CORS allow headers."""
    resp = await async_client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    # CORS middleware returns 200 for preflight
    assert resp.status_code == 200
    assert "access-control-allow-origin" in resp.headers
