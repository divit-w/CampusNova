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


# 10 geographically spread student pickup points centred around Noida, India
MOCK_STUDENTS = [
    {"student_id": f"S{i:03d}", "location": [28.63 + i * 0.001, 77.37 + i * 0.001]}
    for i in range(10)
]

VALID_PAYLOAD = {
    "vehicles": [
        {"vehicle_id": "BUS-01", "capacity": 6, "start_location": [28.6304, 77.3711]},
        {"vehicle_id": "BUS-02", "capacity": 6, "start_location": [28.6350, 77.3800]},
    ],
    "student_overrides": [
        {"student_id": s["student_id"], "location": s["location"]}
        for s in MOCK_STUDENTS
    ],
}


# ─────────────────────────── Happy Path ──────────────────────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.transport.mongo_db.transport_routes_collection.insert_one", new_callable=AsyncMock)
async def test_optimize_routes_success(mock_insert, mock_find_user, async_client):
    """
    2 vehicles + 10 student overrides → 200 OK with structured routes.
    student_overrides bypass the DB query so no students_collection mock needed.
    Verifies: response schema, all 10 students routed, stops are ordered, plan persisted.
    """
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}

    resp = await async_client.post(
        "/api/v1/transport/optimize-routes",
        json=VALID_PAYLOAD,
        headers={"Authorization": f"Bearer {admin_token()}"},
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Top-level shape
    assert data["total_vehicles_used"] == 2
    assert data["total_students_routed"] == 10
    assert len(data["routes"]) == 2

    # Each route must carry students and have ordered stops
    for route in data["routes"]:
        assert route["assigned_student_count"] > 0
        assert route["estimated_distance_km"] >= 0.0
        assert route["estimated_duration_min"] >= 0.0
        assert len(route["stops"]) == route["assigned_student_count"]
        stop_orders = [s["stop_order"] for s in route["stops"]]
        assert stop_orders == list(range(1, len(stop_orders) + 1)), "Stops must be 1-indexed and sequential"

    # Verify the plan was persisted
    assert mock_insert.called


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.transport.mongo_db.transport_routes_collection.insert_one", new_callable=AsyncMock)
async def test_optimize_routes_single_vehicle(mock_insert, mock_find_user, async_client):
    """Single vehicle with capacity >= all students → one route containing all stops."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}

    payload = {
        "vehicles": [
            {"vehicle_id": "BUS-01", "capacity": 20, "start_location": [28.6304, 77.3711]},
        ],
        "student_overrides": [
            {"student_id": s["student_id"], "location": s["location"]}
            for s in MOCK_STUDENTS
        ],
    }

    resp = await async_client.post(
        "/api/v1/transport/optimize-routes",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token()}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total_vehicles_used"] == 1
    assert data["total_students_routed"] == 10


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.transport.mongo_db.transport_routes_collection.insert_one", new_callable=AsyncMock)
@patch("app.services.transport_service.mongo_db.students_collection.find", new_callable=MagicMock)
async def test_optimize_routes_db_query_fallback(mock_find, mock_insert, mock_find_user, async_client):
    """
    When student_overrides is omitted the service queries MongoDB.
    Verifies that the students_collection.find → to_list path is exercised.
    """
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}

    # Simulate 4 students returned from DB with valid home_location fields
    db_students = [
        {"student_id": f"DB{i}", "home_location": [28.63 + i * 0.002, 77.37 + i * 0.002]}
        for i in range(4)
    ]
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=db_students)
    mock_find.return_value = mock_cursor

    payload_no_overrides = {
        "vehicles": [
            {"vehicle_id": "BUS-01", "capacity": 10, "start_location": [28.6304, 77.3711]},
            {"vehicle_id": "BUS-02", "capacity": 10, "start_location": [28.6350, 77.3800]},
        ]
        # No student_overrides — triggers DB query
    }

    resp = await async_client.post(
        "/api/v1/transport/optimize-routes",
        json=payload_no_overrides,
        headers={"Authorization": f"Bearer {admin_token()}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total_students_routed"] == 4
    assert mock_find.called


# ─────────────────────────── RBAC ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_optimize_routes_401_no_token(async_client):
    """Missing JWT → 401 Unauthorized."""
    resp = await async_client.post("/api/v1/transport/optimize-routes", json=VALID_PAYLOAD)
    assert resp.status_code == 401


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_optimize_routes_403_teacher(mock_find_user, async_client):
    """Teacher role → 403 Forbidden."""
    mock_find_user.return_value = {"id": "teacher1", "role": "teacher"}

    resp = await async_client.post(
        "/api/v1/transport/optimize-routes",
        json=VALID_PAYLOAD,
        headers={"Authorization": f"Bearer {teacher_token()}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_optimize_routes_403_student(mock_find_user, async_client):
    """Student role → 403 Forbidden."""
    mock_find_user.return_value = {"id": "student1", "role": "student"}
    student_tok = create_access_token("student1", "student")

    resp = await async_client.post(
        "/api/v1/transport/optimize-routes",
        json=VALID_PAYLOAD,
        headers={"Authorization": f"Bearer {student_tok}"},
    )
    assert resp.status_code == 403


# ─────────────────────────── Validation ──────────────────────────────────────

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_optimize_routes_422_empty_vehicles(mock_find_user, async_client):
    """Empty vehicles list → 422 Unprocessable Entity (Pydantic min_length=1)."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}

    resp = await async_client.post(
        "/api/v1/transport/optimize-routes",
        json={"vehicles": []},
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 422
    assert "detail" in resp.json()


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_optimize_routes_422_zero_capacity(mock_find_user, async_client):
    """Vehicle with capacity=0 → 422 Unprocessable Entity (Pydantic ge=1)."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}

    invalid_payload = {
        "vehicles": [
            {"vehicle_id": "BUS-X", "capacity": 0, "start_location": [28.6304, 77.3711]}
        ],
        "student_overrides": [
            {"student_id": "S001", "location": [28.631, 77.372]}
        ],
    }

    resp = await async_client.post(
        "/api/v1/transport/optimize-routes",
        json=invalid_payload,
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 422
    assert "detail" in resp.json()


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_optimize_routes_422_missing_vehicles(mock_find_user, async_client):
    """Missing `vehicles` field entirely → 422."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}

    resp = await async_client.post(
        "/api/v1/transport/optimize-routes",
        json={"student_overrides": [{"student_id": "S001", "location": [28.63, 77.37]}]},
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.transport.mongo_db.transport_routes_collection.insert_one", new_callable=AsyncMock)
async def test_optimize_routes_capacity_overflow_unassigned(mock_insert, mock_find_user, async_client):
    """
    When total vehicle capacity (2 x 3 = 6) < student count (10),
    verify that:
      1. Exactly 6 students are routed and 4 are unassigned.
      2. No vehicle exceeds its capacity of 3.
      3. Total routed + total unassigned == 10.
    """
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}

    payload = {
        "vehicles": [
            {"vehicle_id": "BUS-01", "capacity": 3, "start_location": [28.6304, 77.3711]},
            {"vehicle_id": "BUS-02", "capacity": 3, "start_location": [28.6350, 77.3800]},
        ],
        "student_overrides": [
            {"student_id": s["student_id"], "location": s["location"]}
            for s in MOCK_STUDENTS
        ],
    }

    resp = await async_client.post(
        "/api/v1/transport/optimize-routes",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token()}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total_students_routed"] == 6
    assert data["total_unassigned"] == 4
    assert len(data["unassigned_students"]) == 4
    assert data["total_vehicles_used"] == 2

    # Verify no vehicle has > 3 students
    for route in data["routes"]:
        assert route["assigned_student_count"] <= 3


@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.endpoints.transport.mongo_db.transport_routes_collection.find_one", new_callable=AsyncMock)
async def test_routes_summary_endpoint(mock_find_route, mock_find_user, async_client):
    """Verifies routes-summary returns KPI aggregate fields."""
    mock_find_user.return_value = {"id": "admin1", "role": "admin"}
    mock_find_route.return_value = {
        "total_vehicles_used": 4,
        "total_students_routed": 152,
        "total_unassigned": 0,
        "generated_at": "2026-08-22T12:00:00Z",
    }

    resp = await async_client.get(
        "/api/v1/transport/routes-summary",
        headers={"Authorization": f"Bearer {admin_token()}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["has_plan"] is True
    assert data["active_routes"] == 4
    assert data["total_students_routed"] == 152
    assert data["total_unassigned"] == 0
