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


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.services.nlp_service.erp_agent.run", new_callable=AsyncMock)
async def test_erp_prompt_success(mock_run, mock_find_user, async_client):
    """Successful admin NL query returns 200 with structured results."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    mock_run.return_value = {
        "action_type": "find",
        "target_collection": "student_attendance",
        "results": [
            {"student_id": "S001", "status": "absent", "date": "2026-08-11"},
            {"student_id": "S002", "status": "absent", "date": "2026-08-11"},
        ],
    }

    token = admin_token()
    payload = {"query": "Show me all absent students today"}

    resp = await async_client.post(
        "/api/v1/erp/prompt",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["action_type"] == "find"
    assert data["target_collection"] == "student_attendance"
    assert len(data["results"]) == 2
    assert data["results"][0]["student_id"] == "S001"
    mock_run.assert_awaited_once_with("Show me all absent students today")


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_erp_prompt_rbac_failure(mock_find_user, async_client):
    """Non-admin role (teacher) must receive 403 Forbidden."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    token = create_access_token("teacher1", "teacher")

    resp = await async_client.post(
        "/api/v1/erp/prompt",
        json={"query": "Show all students"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 403
    assert resp.json()["detail"] == "Not enough permissions"


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.services.nlp_service.erp_agent.run", new_callable=AsyncMock)
async def test_erp_prompt_empty_results(mock_run, mock_find_user, async_client):
    """Query returning no database records still returns 200 with an empty list."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    mock_run.return_value = {
        "action_type": "find",
        "target_collection": "teachers",
        "results": [],
    }

    token = admin_token()
    resp = await async_client.post(
        "/api/v1/erp/prompt",
        json={"query": "List all teachers on leave next week"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["target_collection"] == "teachers"
    assert data["results"] == []
