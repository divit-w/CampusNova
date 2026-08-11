import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock
from app.main import app
from app.core.security import create_access_token

@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

def admin_token():
    return create_access_token("admin1", "admin")

FEASIBLE_PAYLOAD = {
    "days_per_week": 2,
    "periods_per_day": 2,
    "teachers": [
        {"id": "t1", "name": "Alice", "max_hours": 10},
        {"id": "t2", "name": "Bob", "max_hours": 10},
    ],
    "rooms": [
        {"id": "r1", "capacity": 30},
        {"id": "r2", "capacity": 30},
    ],
    "subjects": [
        {"id": "s1", "name": "Math", "required_weekly_hours": 2},
        {"id": "s2", "name": "Science", "required_weekly_hours": 1},
    ],
    "cohorts": [
        {"id": "c1", "name": "Grade 10A", "student_count": 25}
    ],
    "hard_constraints": ["no_double_booking", "max_hours_respected"],
    "fixed_slots": [
        {"subject_id": "s2", "cohort_id": "c1", "day": 1, "period": 1, "room_id": "r2"}
    ],
    "weight_faculty_gaps": 1.0,
    "weight_subject_spread": 2.0
}

INFEASIBLE_PAYLOAD = {
    "days_per_week": 1,
    "periods_per_day": 1,
    "teachers": [{"id": "t1", "name": "Alice", "max_hours": 1}],
    "rooms": [{"id": "r1", "capacity": 30}],
    "subjects": [{"id": "s1", "name": "Math", "required_weekly_hours": 10}],
    "cohorts": [{"id": "c1", "name": "Grade 10A", "student_count": 25}],
    "hard_constraints": ["no_double_booking", "max_hours_respected"],
}

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_generate_feasible_timetable(mock_find_user, async_client):
    """Admin submitting a satisfiable constraint set with cohorts and fixed slots."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    resp = await async_client.post(
        "/api/v1/timetable/generate",
        json=FEASIBLE_PAYLOAD,
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("OPTIMAL", "FEASIBLE")
    assert len(data["schedule"]) == 3  # 2 + 1 required_weekly_hours
    # Verify fixed slot enforcement
    fixed_met = any(
        s["subject_id"] == "s2" and s["cohort_id"] == "c1" and s["day"] == 1 and s["period"] == 1 and s["room_id"] == "r2"
        for s in data["schedule"]
    )
    assert fixed_met, "Fixed slot constraint was not respected"

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_timetable_validation_error(mock_find_user, async_client):
    """Pydantic validation rejects a payload with negative max_hours (422)."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    invalid_payload = FEASIBLE_PAYLOAD.copy()
    invalid_payload["teachers"] = [{"id": "t1", "name": "Alice", "max_hours": -5}]
    
    resp = await async_client.post(
        "/api/v1/timetable/generate",
        json=invalid_payload,
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 422
    assert "detail" in resp.json()

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_timetable_infeasible_returns_422(mock_find_user, async_client):
    """Over-constrained payload returns 422."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    resp = await async_client.post(
        "/api/v1/timetable/generate",
        json=INFEASIBLE_PAYLOAD,
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 422
    assert "INFEASIBLE" in resp.json()["detail"] or "unsatisfiable" in resp.json()["detail"].lower()

@pytest.mark.asyncio
async def test_timetable_rbac_rejects_unauthenticated(async_client):
    """Unauthenticated requests must be rejected with 401."""
    resp = await async_client.post("/api/v1/timetable/generate", json=FEASIBLE_PAYLOAD)
    assert resp.status_code == 401

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_timetable_rbac_rejects_non_admin(mock_find_user, async_client):
    """Non-admin roles must be rejected with 403."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    resp = await async_client.post(
        "/api/v1/timetable/generate",
        json=FEASIBLE_PAYLOAD,
        headers={"Authorization": f"Bearer {create_access_token('teacher1', 'teacher')}"},
    )
    assert resp.status_code == 403
