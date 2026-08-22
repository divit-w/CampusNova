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
@patch("app.api.v1.endpoints.resources.mongo_db.teachers_collection.find", new_callable=MagicMock)
@patch("app.api.v1.endpoints.resources.mongo_db.substitutions_collection.find", new_callable=MagicMock)
@patch("app.api.v1.endpoints.resources.mongo_db.substitutions_collection.insert_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.simulate_rag_policy_check", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.alert_manager.broadcast", new_callable=AsyncMock)
async def test_resolve_conflict_success(mock_broadcast, mock_rag, mock_insert, mock_find_subs, mock_find_teachers, mock_find_teacher_one, mock_find_user, async_client):
    # Mock admin user auth
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    from app.core.security import create_access_token
    token = create_access_token("admin1", "admin")
    
    # Setup mock returns
    mock_rag.return_value = "Policy pass"
    
    # find_one is called for absent teacher
    mock_find_teacher_one.return_value = {"id": "t1", "name": "Dr. Absent"}
    
    # find is called for available substitutes
    mock_find_teachers.return_value.to_list = AsyncMock(return_value=[
        {"id": "t2", "name": "Prof. Sub", "total_historical_substitutions": 5, "historical_leave_probability": 0.1, "subject_compatibility_score": 0.9},
        {"id": "t3", "name": "Dr. Bad Fit", "total_historical_substitutions": 45, "historical_leave_probability": 0.3, "subject_compatibility_score": 0.2}
    ])
    
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
    # The ML model should pick t2 because of lower substitutions and better compatibility
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
@patch("app.api.v1.endpoints.resources.mongo_db.teachers_collection.find", new_callable=MagicMock)
@patch("app.api.v1.endpoints.resources.mongo_db.substitutions_collection.find", new_callable=MagicMock)
async def test_resolve_conflict_no_substitutes(mock_find_subs, mock_find_teachers, mock_find_teacher_one, mock_find_user, async_client):
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    from app.core.security import create_access_token
    token = create_access_token("admin1", "admin")
    
    # Absent teacher exists
    mock_find_teacher_one.return_value = {"id": "t1", "name": "Dr. Absent"}
    
    # Available teachers query returns empty
    mock_find_teachers.return_value.to_list = AsyncMock(return_value=[])
    
    mock_find_subs.return_value.to_list = AsyncMock(return_value=[])
    
    payload = {
        "absent_teacher_id": "t1",
        "date": "2026-08-11",
        "time_slot": "10:00-11:00"
    }
    
    resp = await async_client.post("/api/v1/resources/resolve-conflict", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 409

def test_ml_resource_ranking():
    from app.services.ml_resource_service import PredictiveAllocator
    
    candidates = [
        {"id": "t1", "total_historical_substitutions": 50, "historical_leave_probability": 0.2, "subject_compatibility_score": 0.5},
        {"id": "t2", "total_historical_substitutions": 5, "historical_leave_probability": 0.05, "subject_compatibility_score": 0.95},
        {"id": "t3", "total_historical_substitutions": 25, "historical_leave_probability": 0.1, "subject_compatibility_score": 0.8}
    ]
    
    ranked = PredictiveAllocator.rank_substitutes(candidates)
    
    assert len(ranked) == 3
    assert ranked[0]["id"] == "t2" # Best profile
    assert ranked[1]["id"] == "t3"
    assert ranked[2]["id"] == "t1" # Worst profile
