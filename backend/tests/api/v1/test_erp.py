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


@pytest.mark.asyncio
async def test_erp_query_scope_summary_55_records():
    """Test that querying a cohort with 55 students reports 55 total and 10 preview."""
    from app.services.nlp_service import erp_agent
    from app.services.mongo_service import mongo_db
    
    # Mock students collection count and find
    with patch.object(mongo_db.students_collection, "count_documents", new_callable=AsyncMock) as mock_count, \
         patch.object(mongo_db.students_collection, "find") as mock_find:
        mock_count.return_value = 55
        mock_cursor = MagicMock()
        mock_cursor.limit.return_value.to_list = AsyncMock(return_value=[
            {"student_id": f"STU-{i:03d}", "full_name": f"Student {i}", "class_id": "CSE-A"}
            for i in range(1, 11)
        ])
        mock_find.return_value = mock_cursor

        result = await erp_agent.run("Show students in CSE-A")
        assert result["total_matches"] == 55
        assert result["preview_count"] == 10
        assert "55" in result["summary"]
        assert "10" in result["summary"]
        assert "55 records match this query" in result["summary"]


@pytest.mark.asyncio
async def test_erp_teacher_schedule_query():
    """Test that asking for Dr. Sharma's classes resolves F01 and returns schedule slots with timetable CTA."""
    from app.services.nlp_service import erp_agent

    result = await erp_agent.run("Show Dr. Sharma's classes today")
    assert result["intent"] == "query"
    assert result["target_collection"] == "timetable"
    assert "F01" in result["route"]
    assert "/timetable?faculty=F01" in result["route"]
    assert result["action_card"] is not None
    assert result["action_card"]["faculty_id"] == "F01"
    assert "Dr. Sharma" in result["summary"]


@pytest.mark.asyncio
async def test_erp_find_substitute_action_intent():
    """Test that asking for substitute coverage routes to /substitute with F01 without mutating DB."""
    from app.services.nlp_service import erp_agent

    result = await erp_agent.run("Find a substitute for Dr. Sharma")
    assert result["intent"] == "action"
    assert result["route"] == "/substitute?faculty=F01"
    assert result["suggested_action"] == "Resolve Coverage for Dr. Sharma"
    assert result["action_card"]["route"] == "/substitute?faculty=F01"


@pytest.mark.asyncio
async def test_erp_who_is_absent_query():
    """Test that asking who is absent queries attendance and deep links to /attendance?filter=absent."""
    from app.services.nlp_service import erp_agent
    from app.services.mongo_service import mongo_db

    with patch.object(mongo_db.student_attendance_collection, "count_documents", new_callable=AsyncMock) as mock_count, \
         patch.object(mongo_db.student_attendance_collection, "find") as mock_find:
        mock_count.return_value = 13
        mock_cursor = MagicMock()
        mock_cursor.to_list = AsyncMock(return_value=[
            {"student_id": f"STU-{i:03d}", "status": "absent"} for i in range(1, 11)
        ])
        mock_find.return_value.limit.return_value = mock_cursor

        result = await erp_agent.run("Who is absent today?")
        assert result["intent"] == "query"
        assert result["target_collection"] == "student_attendance"
        assert result["total_matches"] == 13
        assert result["route"] == "/attendance?filter=absent"


@pytest.mark.asyncio
async def test_erp_conversational_greetings():
    """Test that casual greeting returns conversational response with zero DB queries."""
    from app.services.nlp_service import erp_agent
    from app.services.mongo_service import mongo_db

    with patch.object(mongo_db.students_collection, "find") as mock_find:
        result = await erp_agent.run("hello")
        assert result["intent"] == "conversational"
        assert result["results"] == []
        assert not mock_find.called
