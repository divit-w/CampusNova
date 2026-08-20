import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock
from app.main import app
from fastapi import APIRouter, Depends
from app.api.v1.deps import require_roles
from app.core.security import get_password_hash

# Create a test router with restricted endpoint
test_router = APIRouter()
@test_router.get("/admin-only")
async def admin_only_route(current_user: dict = Depends(require_roles(["admin"]))):
    return {"message": "Welcome Admin"}
app.include_router(test_router, prefix="/api/v1/test", tags=["test"])

@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

@pytest.mark.asyncio
@patch("app.services.auth_service.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.services.auth_service.mongo_db.users_collection.insert_one", new_callable=AsyncMock)
async def test_register_and_duplicate(mock_insert, mock_find, async_client):
    mock_find.return_value = None
    
    payload = {
        "email": "test@example.com",
        "password": "secretpassword",
        "full_name": "Test User",
        "role": "student"
    }
    
    response = await async_client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "password" not in data
    assert "id" in data
    
    # Duplicate email
    mock_find.return_value = {"email": "test@example.com"}
    response_dup = await async_client.post("/api/v1/auth/register", json=payload)
    assert response_dup.status_code == 409
    
@pytest.mark.asyncio
@patch("app.services.auth_service.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_login_success_and_failure(mock_find, async_client):
    hashed = get_password_hash("loginpass")
    mock_find.return_value = {
        "id": "123",
        "email": "login@example.com",
        "hashed_password": hashed,
        "role": "teacher"
    }
    
    # Valid Login
    login_data = {"username": "login@example.com", "password": "loginpass"}
    response = await async_client.post("/api/v1/auth/login", data=login_data)
    assert response.status_code == 200
    token_data = response.json()
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"
    
    # Invalid Login
    invalid_login_data = {"username": "login@example.com", "password": "wrongpass"}
    response_inv = await async_client.post("/api/v1/auth/login", data=invalid_login_data)
    assert response_inv.status_code == 401

@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.services.auth_service.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_auth_me_and_invalid_token(mock_auth_find, mock_deps_find, async_client):
    hashed = get_password_hash("mypass")
    mock_user = {
        "id": "123",
        "email": "me@example.com",
        "hashed_password": hashed,
        "role": "student",
        "full_name": "Me User"
    }
    mock_auth_find.return_value = mock_user
    mock_deps_find.return_value = mock_user

    login_resp = await async_client.post("/api/v1/auth/login", data={"username": "me@example.com", "password": "mypass"})
    token = login_resp.json()["access_token"]
    
    # Valid token
    me_resp = await async_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "me@example.com"
    
    # Missing token
    missing_resp = await async_client.get("/api/v1/auth/me")
    assert missing_resp.status_code == 401
    
    # Invalid token
    invalid_resp = await async_client.get("/api/v1/auth/me", headers={"Authorization": "Bearer bad.token.here"})
    assert invalid_resp.status_code == 401
    
@pytest.mark.asyncio
@patch("app.api.v1.deps.mongo_db.users_collection.find_one", new_callable=AsyncMock)
@patch("app.services.auth_service.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_role_enforcement(mock_auth_find, mock_deps_find, async_client):
    hashed = get_password_hash("stu")
    mock_user = {
        "id": "123",
        "email": "student@example.com",
        "hashed_password": hashed,
        "role": "student",
        "full_name": "Student"
    }
    mock_auth_find.return_value = mock_user
    mock_deps_find.return_value = mock_user
    
    login_resp = await async_client.post("/api/v1/auth/login", data={"username": "student@example.com", "password": "stu"})
    token = login_resp.json()["access_token"]
    
    # Student accessing admin route
    admin_resp = await async_client.get("/api/v1/test/admin-only", headers={"Authorization": f"Bearer {token}"})
    assert admin_resp.status_code == 403
