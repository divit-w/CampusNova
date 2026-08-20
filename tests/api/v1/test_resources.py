import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock, MagicMock
from app.main import app

@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.mongo_db.teachers_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.mongo_db.substitutions_collection.find", new_callable=MagicMock)
@patch("app.api.v1.endpoints.resources.mongo_db.substitutions_collection.insert_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.simulate_rag_policy_check", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.alert_manager.broadcast", new_callable=AsyncMock)
async def test_resolve_conflict_success(mock_broadcast, mock_rag, mock_insert, mock_find_subs, mock_find_teachers, mock_find_user, async_client):
    # Mock admin user auth
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    from app.core.security import create_access_token
    token = create_access_token("admin1", "admin")
    
    # Setup mock returns
    mock_rag.return_value = "Policy pass"
    
    # find_one is called twice: first for absent teacher, second for substitute
    mock_find_teachers.side_effect = [
        {"id": "t1", "name": "Dr. Absent"},
        {"id": "t2", "name": "Prof. Sub"}
    ]
    
    # mock cursor to_list
    mock_find_subs.return_value.to_list = AsyncMock(return_value=[])
    
    payload = {
        "absent_teacher_id": "t1",
        "date": "2026-08-11",
        "time_slot": "10:00-11:00"
    }
    
    resp = await async_client.post("/api/v1/resources/resolve-conflict", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["substitute_teacher_id"] == "t2"
    assert mock_broadcast.called

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_resolve_conflict_rbac_failure(mock_find_user, async_client):
    mock_find_user.return_value = {"id": "stu1", "role": "student"}
    from app.core.security import create_access_token
    token = create_access_token("stu1", "student")
    
    payload = {
        "absent_teacher_id": "t1",
        "date": "2026-08-11",
        "time_slot": "10:00-11:00"
    }
    resp = await async_client.post("/api/v1/resources/resolve-conflict", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.mongo_db.teachers_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.mongo_db.substitutions_collection.find", new_callable=MagicMock)
async def test_resolve_conflict_no_substitutes(mock_find_subs, mock_find_teachers, mock_find_user, async_client):
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    from app.core.security import create_access_token
    token = create_access_token("admin1", "admin")
    
    # First call: absent teacher exists. Second call: no substitute
    mock_find_teachers.side_effect = [
        {"id": "t1", "name": "Dr. Absent"},
        None
    ]
    
    mock_find_subs.return_value.to_list = AsyncMock(return_value=[])
    
    payload = {
        "absent_teacher_id": "t1",
        "date": "2026-08-11",
        "time_slot": "10:00-11:00"
    }
    
    resp = await async_client.post("/api/v1/resources/resolve-conflict", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 409
