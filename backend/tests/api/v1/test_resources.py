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
    mock_find_teacher_one.return_value = {"teacher_id": "t1", "id": "t1", "name": "Dr. Absent"}
    
    # find is called for available substitutes
    mock_find_teachers.return_value.to_list = AsyncMock(return_value=[
        {"teacher_id": "t2", "id": "t2", "name": "Prof. Sub", "total_historical_substitutions": 5, "historical_leave_probability": 0.1, "subject_compatibility_score": 0.9},
        {"teacher_id": "t3", "id": "t3", "name": "Dr. Bad Fit", "total_historical_substitutions": 45, "historical_leave_probability": 0.3, "subject_compatibility_score": 0.2}
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
    mock_find_teacher_one.return_value = {"teacher_id": "t1", "id": "t1", "name": "Dr. Absent"}
    
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

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.mongo_db.teachers_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.mongo_db.timetable_jobs_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.mongo_db.substitutions_collection.find", new_callable=MagicMock)
async def test_get_faculty_schedule_canonical_monday(mock_find_subs, mock_find_job, mock_find_teacher, mock_find_user, async_client):
    """Test get_faculty_schedule returns real scheduled classes on Monday for F01."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    from app.core.security import create_access_token
    token = create_access_token("admin1", "admin")

    mock_find_teacher.return_value = {"teacher_id": "F01", "full_name": "Dr. Sharma", "subject": "Data Structures"}
    mock_find_job.return_value = None  # Use canonical fallback
    mock_find_subs.return_value.to_list = AsyncMock(return_value=[])

    # 2026-08-17 is a Monday (day 0)
    resp = await async_client.get("/api/v1/resources/faculty-schedule/F01?date=2026-08-17", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["teacher_id"] == "F01"
    assert data["full_name"] == "Dr. Sharma"
    assert len(data["affected_classes"]) == 2
    assert data["affected_classes"][0]["time_slot"] == "P1"
    assert data["affected_classes"][0]["cohort"] == "CSE-A"
    assert data["affected_classes"][0]["student_count"] == 55
    assert data["affected_classes"][1]["time_slot"] == "P3"
    assert data["affected_classes"][1]["cohort"] == "CSE-B"
    assert data["affected_classes"][1]["student_count"] == 50

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.mongo_db.teachers_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.mongo_db.timetable_jobs_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.mongo_db.substitutions_collection.find", new_callable=MagicMock)
async def test_get_faculty_schedule_weekend_returns_zero_classes(mock_find_subs, mock_find_job, mock_find_teacher, mock_find_user, async_client):
    """Test get_faculty_schedule on a Sunday returns 0 affected classes without emergency state."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    from app.core.security import create_access_token
    token = create_access_token("admin1", "admin")

    mock_find_teacher.return_value = {"teacher_id": "F01", "full_name": "Dr. Sharma", "subject": "Data Structures"}
    mock_find_job.return_value = None
    mock_find_subs.return_value.to_list = AsyncMock(return_value=[])

    # 2026-08-23 is a Sunday
    resp = await async_client.get("/api/v1/resources/faculty-schedule/F01?date=2026-08-23", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["affected_classes"]) == 0

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.mongo_db.teachers_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.mongo_db.timetable_jobs_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.mongo_db.substitutions_collection.find", new_callable=MagicMock)
async def test_get_faculty_schedule_with_assigned_substitute(mock_find_subs, mock_find_job, mock_find_teacher, mock_find_user, async_client):
    """Test get_faculty_schedule reflects already assigned substitute teacher."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    from app.core.security import create_access_token
    token = create_access_token("admin1", "admin")

    def teacher_lookup(query):
        tid = query.get("$or", [{}])[0].get("teacher_id")
        if tid == "F01":
            return {"teacher_id": "F01", "full_name": "Dr. Sharma", "subject": "Data Structures"}
        if tid == "F03":
            return {"teacher_id": "F03", "full_name": "Prof. Gupta", "subject": "Operating Systems"}
        return None

    mock_find_teacher.side_effect = teacher_lookup
    mock_find_job.return_value = None
    mock_find_subs.return_value.to_list = AsyncMock(return_value=[
        {"absent_teacher_id": "F01", "date": "2026-08-17", "time_slot": "P1", "substitute_teacher_id": "F03"}
    ])

    resp = await async_client.get("/api/v1/resources/faculty-schedule/F01?date=2026-08-17", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["affected_classes"][0]["time_slot"] == "P1"
    assert data["affected_classes"][0]["assigned_substitute_id"] == "F03"
    assert data["affected_classes"][0]["assigned_substitute_name"] == "Prof. Gupta"
    assert data["affected_classes"][1]["assigned_substitute_id"] is None

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.resources.mongo_db.teachers_collection.find_one", new_callable=AsyncMock)
async def test_get_faculty_schedule_invalid_faculty_404(mock_find_teacher, mock_find_user, async_client):
    """Test get_faculty_schedule with unknown faculty returns 404."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    from app.core.security import create_access_token
    token = create_access_token("admin1", "admin")

    mock_find_teacher.return_value = None

    resp = await async_client.get("/api/v1/resources/faculty-schedule/NONEXISTENT?date=2026-08-17", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404
