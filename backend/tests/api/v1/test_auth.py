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

from app.core.security import create_access_token

@pytest.mark.asyncio
@patch("app.services.mongo_service.mongo_db.users_collection.insert_one", new_callable=AsyncMock)
@patch("app.services.mongo_service.mongo_db.users_collection.find_one", new_callable=AsyncMock)
async def test_register_and_duplicate(mock_find, mock_insert, async_client):
    calls = []
    async def mock_find_one(query, *args, **kwargs):
        if "id" in query or "$or" in query:
            return {"id": "admin1", "role": "admin", "university_id": "demo-university"}
        if "email" in query:
            calls.append(query["email"])
            if len(calls) > 1:
                return {"email": query["email"]}
            return None
        return None

    mock_find.side_effect = mock_find_one
    admin_token = create_access_token("admin1", "admin")
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    payload = {
        "email": "test@example.com",
        "password": "secretpassword",
        "full_name": "Test User",
        "role": "student"
    }
    
    response = await async_client.post("/api/v1/auth/register", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "password" not in data
    assert "id" in data
    
    # Duplicate email
    response_dup = await async_client.post("/api/v1/auth/register", json=payload, headers=headers)
    assert response_dup.status_code == 409

@pytest.mark.asyncio
async def test_register_unauthenticated_rejected(async_client):
    payload = {
        "email": "hacker@example.com",
        "password": "secretpassword",
        "full_name": "Hacker User",
        "role": "admin"
    }
    response = await async_client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 401
    
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


# ── Google OAuth Genuine Flow Tests ──────────────────────────────────────────

from app.services.auth_service import verify_google_credential, authenticate_or_create_google_user
from fastapi import HTTPException
from unittest.mock import MagicMock

@pytest.mark.asyncio
async def test_google_auth_missing_credential_returns_400(async_client):
    res = await async_client.post("/api/v1/auth/google", json={"credential": ""})
    assert res.status_code == 400
    assert "Missing Google credential" in res.json().get("detail", "")

    res_spaces = await async_client.post("/api/v1/auth/google", json={"credential": "   "})
    assert res_spaces.status_code == 400


@pytest.mark.asyncio
async def test_google_auth_new_user_provisions_isolated_tenant(async_client):
    import uuid
    suffix = uuid.uuid4().hex[:8]
    verified_payload = {
        "iss": "https://accounts.google.com",
        "sub": f"sub_{suffix}",
        "email": f"newadmin_{suffix}@realuniversity.edu",
        "name": "Prof. Real Admin",
        "email_verified": True,
        "exp": 2000000000,
    }

    with patch("app.api.v1.endpoints.auth.verify_google_credential", return_value=verified_payload):
        res = await async_client.post("/api/v1/auth/google", json={"credential": "real_google_token"})
        assert res.status_code == 200
        token_data = res.json()
        assert "access_token" in token_data

        token = token_data["access_token"]
        res_me = await async_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res_me.status_code == 200
        user_info = res_me.json()
        assert user_info["email"] == f"newadmin_{suffix}@realuniversity.edu"
        assert user_info["role"] == "admin"
        assert user_info["is_setup_complete"] is False
        assert user_info["is_demo"] is False
        assert user_info["university_id"].startswith("univ_")
        assert user_info["university_id"] != "demo-university"


@pytest.mark.asyncio
async def test_google_auth_returning_user_retains_tenant(async_client):
    import uuid
    suffix = uuid.uuid4().hex[:8]
    verified_payload = {
        "iss": "https://accounts.google.com",
        "sub": f"sub_{suffix}",
        "email": f"returning_{suffix}@realuniversity.edu",
        "name": "Returning Admin",
        "email_verified": True,
        "exp": 2000000000,
    }

    with patch("app.api.v1.endpoints.auth.verify_google_credential", return_value=verified_payload):
        # 1. First login -> provisions tenant
        res1 = await async_client.post("/api/v1/auth/google", json={"credential": "real_google_token"})
        assert res1.status_code == 200
        token1 = res1.json()["access_token"]
        me1 = (await async_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token1}"})).json()
        first_univ_id = me1["university_id"]

        # 2. Returning login -> loads same tenant
        res2 = await async_client.post("/api/v1/auth/google", json={"credential": "real_google_token"})
        assert res2.status_code == 200
        token2 = res2.json()["access_token"]
        me2 = (await async_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token2}"})).json()
        assert me2["university_id"] == first_univ_id
        assert me2["email"] == f"returning_{suffix}@realuniversity.edu"


@pytest.mark.asyncio
async def test_google_auth_never_produces_demo_account(async_client):
    import uuid
    suffix = uuid.uuid4().hex[:8]
    verified_payload = {
        "iss": "https://accounts.google.com",
        "sub": f"sub_{suffix}",
        "email": f"arbitrary_user_{suffix}@gmail.com",
        "name": "Arbitrary User",
        "email_verified": True,
        "exp": 2000000000,
    }

    with patch("app.api.v1.endpoints.auth.verify_google_credential", return_value=verified_payload):
        res = await async_client.post("/api/v1/auth/google", json={"credential": "real_google_token"})
        assert res.status_code == 200
        token = res.json()["access_token"]
        me = (await async_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})).json()
        assert me["email"] != "demo-judge@campusnova.com"
        assert me["university_id"] != "demo-university"
        assert me["is_demo"] is False


@pytest.mark.asyncio
async def test_verify_google_credential_unit():
    # 1. Missing credential
    with pytest.raises(HTTPException) as exc1:
        await verify_google_credential("")
    assert exc1.value.status_code == 400

    # 2. Google returns 400 (Invalid token)
    mock_resp_invalid = MagicMock()
    mock_resp_invalid.status_code = 400
    mock_resp_invalid.headers = {"content-type": "application/json"}
    mock_resp_invalid.json.return_value = {"error_description": "Invalid Value"}

    with patch("httpx.AsyncClient.get", return_value=mock_resp_invalid):
        with pytest.raises(HTTPException) as exc2:
            await verify_google_credential("invalid_token")
        assert exc2.value.status_code == 401
        assert "Invalid Google token" in exc2.value.detail

    # 3. Google returns 400 (Expired token)
    mock_resp_expired = MagicMock()
    mock_resp_expired.status_code = 400
    mock_resp_expired.headers = {"content-type": "application/json"}
    mock_resp_expired.json.return_value = {"error_description": "Token is expired"}

    with patch("httpx.AsyncClient.get", return_value=mock_resp_expired):
        with pytest.raises(HTTPException) as exc3:
            await verify_google_credential("expired_token")
        assert exc3.value.status_code == 401
        assert "Google token has expired" in exc3.value.detail

    # 4. Google returns 200 but issuer is invalid
    mock_resp_bad_issuer = MagicMock()
    mock_resp_bad_issuer.status_code = 200
    mock_resp_bad_issuer.json.return_value = {
        "iss": "https://malicious-issuer.com",
        "email": "hacker@evil.com",
        "email_verified": True,
        "exp": 2000000000,
    }

    with patch("httpx.AsyncClient.get", return_value=mock_resp_bad_issuer):
        with pytest.raises(HTTPException) as exc4:
            await verify_google_credential("bad_issuer_token")
        assert exc4.value.status_code == 401
        assert "Invalid Google token issuer" in exc4.value.detail

    # 5. Google returns 200 but email_verified is False
    mock_resp_unverified = MagicMock()
    mock_resp_unverified.status_code = 200
    mock_resp_unverified.json.return_value = {
        "iss": "https://accounts.google.com",
        "email": "unverified@gmail.com",
        "email_verified": False,
        "exp": 2000000000,
    }

    with patch("httpx.AsyncClient.get", return_value=mock_resp_unverified):
        with pytest.raises(HTTPException) as exc5:
            await verify_google_credential("unverified_email_token")
        assert exc5.value.status_code == 401
        assert "Google email is not verified" in exc5.value.detail

    # 6. Google returns 200 with audience mismatch
    mock_resp_aud_mismatch = MagicMock()
    mock_resp_aud_mismatch.status_code = 200
    mock_resp_aud_mismatch.json.return_value = {
        "iss": "https://accounts.google.com",
        "email": "user@gmail.com",
        "aud": "wrong_audience_client_id.apps.googleusercontent.com",
        "email_verified": True,
        "exp": 2000000000,
    }

    from app.core.config import settings
    orig_client_id = settings.GOOGLE_CLIENT_ID
    try:
        settings.GOOGLE_CLIENT_ID = "correct_client_id.apps.googleusercontent.com"
        with patch("httpx.AsyncClient.get", return_value=mock_resp_aud_mismatch):
            with pytest.raises(HTTPException) as exc6:
                await verify_google_credential("aud_mismatch_token")
            assert exc6.value.status_code == 401
            assert "Google token audience mismatch" in exc6.value.detail
    finally:
        settings.GOOGLE_CLIENT_ID = orig_client_id

    # 7. Valid token returns verified payload
    mock_resp_valid = MagicMock()
    mock_resp_valid.status_code = 200
    mock_resp_valid.json.return_value = {
        "iss": "https://accounts.google.com",
        "email": "valid@gmail.com",
        "name": "Valid User",
        "email_verified": True,
        "exp": 2000000000,
    }

    with patch("httpx.AsyncClient.get", return_value=mock_resp_valid):
        payload = await verify_google_credential("valid_token")
        assert payload["email"] == "valid@gmail.com"
        assert payload["name"] == "Valid User"

