import pytest
import pytest_asyncio
from unittest.mock import patch, AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security import create_access_token
from app.services.auth_service import authenticate_or_create_google_user

@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

@pytest.mark.asyncio
async def test_google_auth_creates_empty_tenant():
    """Verify that Google auth provisions a unique tenant with None university_name."""
    mock_users = AsyncMock()
    mock_institutions = AsyncMock()
    
    # User does not exist yet
    mock_users.find_one.return_value = None
    mock_institutions.find_one.return_value = None

    with patch("app.services.auth_service.mongo_db.users_collection", mock_users), \
         patch("app.services.auth_service.mongo_db.institutions_collection", mock_institutions):
        
        user_doc = await authenticate_or_create_google_user({
            "email": "prof.alice@newuniv.edu",
            "name": "Alice Walker",
            "picture": "https://example.com/avatar.jpg",
            "sub": "google-sub-123"
        })
        
        assert user_doc["email"] == "prof.alice@newuniv.edu"
        assert user_doc["role"] == "admin"
        assert user_doc["university_id"].startswith("univ_")
        assert user_doc["is_setup_complete"] is False
        assert user_doc["is_demo"] is False
        
        # Verify institution was created with None name
        mock_institutions.insert_one.assert_called_once()
        inst_arg = mock_institutions.insert_one.call_args[0][0]
        assert inst_arg["name"] is None
        assert inst_arg["university_id"] == user_doc["university_id"]
        assert inst_arg["is_setup_complete"] is False

@pytest.mark.asyncio
async def test_demo_account_preserves_demo_university():
    """Verify that demo judge account is tagged with demo-university tenant."""
    mock_users = AsyncMock()
    mock_institutions = AsyncMock()
    
    mock_users.find_one.return_value = {
        "id": "judge-123",
        "email": "demo-judge@campusnova.com",
        "role": "admin",
        "university_id": "demo-university",
        "is_demo": True,
        "is_setup_complete": True
    }
    mock_institutions.find_one.return_value = {
        "university_id": "demo-university",
        "name": "CampusNova Demo University",
        "is_demo": True,
        "is_setup_complete": True
    }

    with patch("app.services.auth_service.mongo_db.users_collection", mock_users), \
         patch("app.services.auth_service.mongo_db.institutions_collection", mock_institutions):
        
        user_doc = await authenticate_or_create_google_user({
            "email": "demo-judge@campusnova.com",
            "name": "Demo Judge",
        })
        
        assert user_doc["university_id"] == "demo-university"
        assert user_doc["is_demo"] is True

@pytest.mark.asyncio
async def test_cross_tenant_student_isolation(async_client):
    """Verify that Tenant A cannot query or see students created in Tenant B."""
    tenant_a_id = "univ_tenant_aaa"
    tenant_b_id = "univ_tenant_bbb"
    
    token_a = create_access_token("admin_a", "admin")
    
    mock_users = AsyncMock()
    mock_institutions = AsyncMock()
    mock_students = MagicMock()
    
    # Current user is in Tenant A
    async def mock_user_find(query, *args, **kwargs):
        if query.get("id") == "admin_a" or any(item.get("id") == "admin_a" or item.get("email") == "admin_a" for item in query.get("$or", [])):
            return {"id": "admin_a", "role": "admin", "university_id": tenant_a_id, "email": "a@univ-a.edu"}
        return None
        
    mock_users.find_one.side_effect = mock_user_find
    mock_institutions.find_one.return_value = {
        "university_id": tenant_a_id,
        "name": "University A",
        "is_setup_complete": True
    }
    
    # When querying students, find() must return cursor with valid schema fields
    mock_cursor = MagicMock()
    mock_cursor.skip.return_value = mock_cursor
    mock_cursor.limit.return_value = mock_cursor
    mock_cursor.to_list = AsyncMock(return_value=[
        {
            "student_id": "STU-001",
            "full_name": "Alice A",
            "grade": "10",
            "section": "A",
            "email": "alice@univ-a.edu",
            "university_id": tenant_a_id
        }
    ])
    mock_students.find.return_value = mock_cursor
    mock_students.count_documents = AsyncMock(return_value=1)

    with patch("app.api.v1.deps.mongo_db.users_collection", mock_users), \
         patch("app.api.v1.deps.mongo_db.institutions_collection", mock_institutions), \
         patch("app.api.v1.endpoints.admin_erp.mongo_db.students_collection", mock_students):
        
        headers = {"Authorization": f"Bearer {token_a}"}
        resp = await async_client.get("/api/v1/admin/students", headers=headers)
        
        assert resp.status_code == 200
        # Verify the database query was scoped to Tenant A
        find_filter = mock_students.find.call_args[0][0]
        assert find_filter.get("university_id") == tenant_a_id
        assert find_filter.get("university_id") != tenant_b_id

@pytest.mark.asyncio
async def test_timetable_job_tenant_isolation(async_client):
    """Verify that Timetable status query rejects requests across tenants."""
    tenant_a_id = "univ_tenant_aaa"
    tenant_b_id = "univ_tenant_bbb"
    job_id = "job-12345"
    
    token_b = create_access_token("admin_b", "admin")
    
    mock_users = AsyncMock()
    mock_institutions = AsyncMock()
    mock_jobs = AsyncMock()
    
    # Caller is in Tenant B
    mock_users.find_one.return_value = {
        "id": "admin_b", "role": "admin", "university_id": tenant_b_id, "email": "b@univ-b.edu"
    }
    mock_institutions.find_one.return_value = {
        "university_id": tenant_b_id, "name": "University B", "is_setup_complete": True
    }
    
    # Database find_one called with job_id and university_id
    mock_jobs.find_one.return_value = None  # Not found because job belongs to Tenant A

    with patch("app.api.v1.deps.mongo_db.users_collection", mock_users), \
         patch("app.api.v1.deps.mongo_db.institutions_collection", mock_institutions), \
         patch("app.api.v1.timetable.mongo_db.timetable_jobs_collection", mock_jobs):
        
        headers = {"Authorization": f"Bearer {token_b}"}
        resp = await async_client.get(f"/api/v1/timetable/status/{job_id}", headers=headers)
        
        assert resp.status_code == 404
        # Verify find_one query checked university_id: tenant_b_id
        find_query = mock_jobs.find_one.call_args[0][0]
        assert find_query["job_id"] == job_id
        assert find_query["university_id"] == tenant_b_id

@pytest.mark.asyncio
async def test_university_setup_and_quick_start(async_client):
    """Verify PATCH /admin/university and POST /admin/setup/quick-start."""
    tenant_id = "univ_custom_123"
    token = create_access_token("admin_user", "admin")
    
    mock_users = AsyncMock()
    mock_institutions = AsyncMock()
    mock_students = AsyncMock()
    mock_teachers = AsyncMock()
    mock_classes = AsyncMock()
    mock_rooms = AsyncMock()
    mock_subjects = AsyncMock()
    
    mock_users.find_one.return_value = {
        "id": "admin_user", "role": "admin", "university_id": tenant_id, "email": "admin@custom.edu"
    }
    mock_institutions.find_one.return_value = {
        "university_id": tenant_id, "name": "Apex University of Science", "is_setup_complete": True
    }
    mock_institutions.update_one.return_value = MagicMock(matched_count=1)
    
    with patch("app.api.v1.deps.mongo_db.users_collection", mock_users), \
         patch("app.api.v1.deps.mongo_db.institutions_collection", mock_institutions), \
         patch("app.api.v1.endpoints.admin_erp.mongo_db.institutions_collection", mock_institutions), \
         patch("app.api.v1.endpoints.admin_erp.mongo_db.students_collection", mock_students), \
         patch("app.api.v1.endpoints.admin_erp.mongo_db.teachers_collection", mock_teachers), \
         patch("app.api.v1.endpoints.admin_erp.mongo_db.classes_collection", mock_classes), \
         patch("app.api.v1.endpoints.admin_erp.mongo_db.rooms_collection", mock_rooms), \
         patch("app.api.v1.endpoints.admin_erp.mongo_db.subjects_collection", mock_subjects):
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # 1. Update university name
        resp = await async_client.patch(
            "/api/v1/admin/university",
            json={"university_name": "Apex University of Science"},
            headers=headers
        )
        assert resp.status_code == 200
        assert resp.json()["university_name"] == "Apex University of Science"
        assert resp.json()["is_setup_complete"] is True
        
        # 2. Quick start
        resp_qs = await async_client.post("/api/v1/admin/setup/quick-start", headers=headers)
        assert resp_qs.status_code == 200
        assert resp_qs.json()["status"] == "success"
        
        # Verify starter items were stamped with current user's university_id via update_one
        assert mock_students.update_one.call_count >= 6
        for call in mock_students.update_one.call_args_list:
            filter_dict = call[0][0]
            assert filter_dict["university_id"] == tenant_id
            
        assert mock_teachers.update_one.call_count >= 3
        for call in mock_teachers.update_one.call_args_list:
            filter_dict = call[0][0]
            assert filter_dict["university_id"] == tenant_id
