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


# ─────────────────────────────────────────────────────────────────────────────
# POST /generate — returns 202 immediately and dispatches background solver
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.timetable.mongo_db.timetable_jobs_collection.insert_one", new_callable=AsyncMock)
@patch("app.api.v1.timetable.mongo_db.timetable_jobs_collection.update_one", new_callable=AsyncMock)
async def test_generate_timetable_returns_202(mock_update, mock_insert, mock_find_user, async_client):
    """
    POST /generate must return HTTP 202 Accepted immediately with a job_id.
    The solver runs in the background — no 200 with a schedule should be returned.
    update_one is mocked to prevent the background task from attempting a Motor
    call after the test event loop has been torn down.
    """
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    mock_insert.return_value = MagicMock()
    mock_update.return_value = MagicMock()

    resp = await async_client.post(
        "/api/v1/timetable/generate",
        json=FEASIBLE_PAYLOAD,
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 202
    data = resp.json()
    assert "job_id" in data
    assert data["status"] == "processing"
    assert len(data["job_id"]) == 36  # UUID4 format


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.timetable.mongo_db.timetable_jobs_collection.insert_one", new_callable=AsyncMock)
@patch("app.api.v1.timetable.mongo_db.timetable_jobs_collection.update_one", new_callable=AsyncMock)
async def test_generate_timetable_persists_initial_job_state(mock_update, mock_insert, mock_find_user, async_client):
    """
    POST /generate must call insert_one to persist the initial 'processing' job state
    BEFORE dispatching the background task so status polling never 404s immediately.
    update_one is mocked to prevent the background task's DB write from firing
    after the test event loop has been torn down.
    """
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    mock_insert.return_value = MagicMock()
    mock_update.return_value = MagicMock()

    resp = await async_client.post(
        "/api/v1/timetable/generate",
        json=FEASIBLE_PAYLOAD,
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 202
    assert mock_insert.called, "insert_one must be called to persist initial job state"
    inserted_doc = mock_insert.call_args[0][0]
    assert inserted_doc["status"] == "processing"
    assert "job_id" in inserted_doc
    assert inserted_doc["result"] is None


# ─────────────────────────────────────────────────────────────────────────────
# GET /status/{job_id} — polls the persisted job state
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.timetable.mongo_db.timetable_jobs_collection.find_one", new_callable=AsyncMock)
async def test_status_returns_processing(mock_job_find, mock_find_user, async_client):
    """Status endpoint returns 'processing' while the solver is still running."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    mock_job_find.return_value = {
        "job_id": "test-job-1",
        "status": "processing",
        "result": None,
        "error": None,
        "created_at": "2026-08-12T00:00:00+00:00",
        "completed_at": None,
    }

    resp = await async_client.get(
        "/api/v1/timetable/status/test-job-1",
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "processing"
    assert data["result"] is None


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.timetable.mongo_db.timetable_jobs_collection.find_one", new_callable=AsyncMock)
async def test_status_returns_completed_schedule(mock_job_find, mock_find_user, async_client):
    """Status endpoint returns the full schedule when solver finishes OPTIMAL."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    mock_job_find.return_value = {
        "job_id": "test-job-2",
        "status": "completed",
        "result": {
            "status": "OPTIMAL",
            "schedule": [
                {"teacher_id": "t1", "cohort_id": "c1", "room_id": "r1",
                 "subject_id": "s1", "day": 0, "period": 0}
            ],
        },
        "error": None,
        "created_at": "2026-08-12T00:00:00+00:00",
        "completed_at": "2026-08-12T00:00:10+00:00",
    }

    resp = await async_client.get(
        "/api/v1/timetable/status/test-job-2",
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert data["result"]["status"] == "OPTIMAL"
    assert len(data["result"]["schedule"]) == 1


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.timetable.mongo_db.timetable_jobs_collection.find_one", new_callable=AsyncMock)
async def test_status_infeasible_returns_422(mock_job_find, mock_find_user, async_client):
    """
    When the solver finishes INFEASIBLE the status endpoint must return 422 —
    same HTTP contract as the old synchronous endpoint, now deferred to poll time.
    """
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    mock_job_find.return_value = {
        "job_id": "test-job-3",
        "status": "completed",
        "result": {"status": "INFEASIBLE", "schedule": []},
        "error": None,
        "created_at": "2026-08-12T00:00:00+00:00",
        "completed_at": "2026-08-12T00:00:10+00:00",
    }

    resp = await async_client.get(
        "/api/v1/timetable/status/test-job-3",
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 422
    assert "INFEASIBLE" in resp.json()["detail"]


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.timetable.mongo_db.timetable_jobs_collection.find_one", new_callable=AsyncMock)
async def test_status_job_not_found_returns_404(mock_job_find, mock_find_user, async_client):
    """Polling a non-existent job_id must return 404."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    mock_job_find.return_value = None

    resp = await async_client.get(
        "/api/v1/timetable/status/nonexistent-job",
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Validation — still enforced at the POST /generate boundary
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_timetable_validation_error(mock_find_user, async_client):
    """Pydantic rejects a payload with negative max_hours before the job is created."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    invalid_payload = dict(FEASIBLE_PAYLOAD)
    invalid_payload["teachers"] = [{"id": "t1", "name": "Alice", "max_hours": -5}]

    resp = await async_client.post(
        "/api/v1/timetable/generate",
        json=invalid_payload,
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 422
    assert "detail" in resp.json()


# ─────────────────────────────────────────────────────────────────────────────
# RBAC — enforced on both endpoints
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_timetable_rbac_rejects_unauthenticated(async_client):
    """Unauthenticated requests must be rejected with 401."""
    resp = await async_client.post("/api/v1/timetable/generate", json=FEASIBLE_PAYLOAD)
    assert resp.status_code == 401


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_timetable_rbac_rejects_non_admin(mock_find_user, async_client):
    """Non-admin roles must be rejected with 403 on POST /generate."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    resp = await async_client.post(
        "/api/v1/timetable/generate",
        json=FEASIBLE_PAYLOAD,
        headers={"Authorization": f"Bearer {create_access_token('teacher1', 'teacher')}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_timetable_status_rbac_rejects_non_admin(mock_find_user, async_client):
    """Non-admin roles must be rejected with 403 on GET /status/{job_id}."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}
    resp = await async_client.get(
        "/api/v1/timetable/status/some-job-id",
        headers={"Authorization": f"Bearer {create_access_token('teacher1', 'teacher')}"},
    )
    assert resp.status_code == 403


# ─────────────────────────────────────────────────────────────────────────────
# Active / Activate / Validate Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.timetable.mongo_db.active_timetable_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.timetable.mongo_db.timetable_jobs_collection.find_one", new_callable=AsyncMock)
async def test_get_active_timetable_fallback_and_active(mock_job_find, mock_active_find, mock_user, async_client):
    """Test retrieving active timetable when active exists vs when empty."""
    mock_user.return_value = {"id": "admin1", "role": "admin"}
    
    # 1. When empty
    mock_active_find.return_value = None
    mock_job_find.return_value = None
    res = await async_client.get(
        "/api/v1/timetable/active",
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert res.status_code == 200
    assert res.json()["is_active"] is False

    # 2. When active exists
    mock_active_find.return_value = {
        "is_active": True,
        "status": "ACTIVE",
        "schedule": [{"day": 0, "period": 0, "teacher_id": "F01", "cohort_id": "CSE-A", "room_id": "R101", "subject_id": "SUB-CS101"}],
        "total_slots_scheduled": 1,
    }
    res2 = await async_client.get(
        "/api/v1/timetable/active",
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert res2.status_code == 200
    assert res2.json()["is_active"] is True
    assert res2.json()["total_slots_scheduled"] == 1


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.timetable.mongo_db.timetable_jobs_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.timetable.mongo_db.active_timetable_collection.update_many", new_callable=AsyncMock)
@patch("app.api.v1.timetable.mongo_db.active_timetable_collection.insert_one", new_callable=AsyncMock)
@patch("app.api.v1.timetable.mongo_db.timetable_jobs_collection.update_many", new_callable=AsyncMock)
@patch("app.api.v1.timetable.mongo_db.timetable_jobs_collection.update_one", new_callable=AsyncMock)
async def test_activate_timetable_workflow(mock_j_up1, mock_j_upm, mock_insert, mock_upm, mock_j_find, mock_user, async_client):
    """Test activating a completed timetable job persists active schedule."""
    mock_user.return_value = {"id": "admin1", "role": "admin"}
    mock_j_find.return_value = {
        "job_id": "job-100",
        "status": "completed",
        "result": {
            "status": "OPTIMAL",
            "schedule": [{"day": 0, "period": 0, "teacher_id": "F01", "cohort_id": "CSE-A", "room_id": "R101", "subject_id": "SUB-CS101"}],
            "solve_time_ms": 42.5,
        },
    }

    res = await async_client.post(
        "/api/v1/timetable/activate",
        json={"job_id": "job-100"},
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["active_timetable"]["is_active"] is True
    mock_insert.assert_called_once()


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_validate_timetable_detects_intentional_conflicts(mock_user, async_client):
    """Test validate endpoint detecting teacher, room, and cohort double booking."""
    mock_user.return_value = {"id": "admin1", "role": "admin"}
    payload = {
        "teachers": [{"id": "F01", "name": "Dr. Sharma", "blocked_slots": [{"day": 0, "period": 0}]}],
        "rooms": [{"id": "R101", "name": "LH-101"}],
        "cohorts": [{"id": "CSE-A", "name": "CSE-A"}],
        "schedule": [
            # Teacher double booking on day 0, period 1
            {"day": 0, "period": 1, "teacher_id": "F01", "cohort_id": "CSE-A", "room_id": "R101", "subject_id": "SUB-1"},
            {"day": 0, "period": 1, "teacher_id": "F01", "cohort_id": "CSE-B", "room_id": "R102", "subject_id": "SUB-2"},
            # Blocked slot on day 0, period 0
            {"day": 0, "period": 0, "teacher_id": "F01", "cohort_id": "CSE-A", "room_id": "R101", "subject_id": "SUB-1"},
        ]
    }

    res = await async_client.post(
        "/api/v1/timetable/validate",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["is_valid"] is False
    assert data["hard_conflicts_count"] >= 2

