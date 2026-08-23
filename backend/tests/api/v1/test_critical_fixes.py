import pytest
import base64
import json
import uuid
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security import create_access_token

@pytest.mark.asyncio
async def test_today_sunday_attendance_zero_records():
    token = create_access_token('demo-judge@campusnova.com', role='admin')
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        res = await client.get('/api/v1/admin/dashboard-summary', headers={'Authorization': f'Bearer {token}'})
        assert res.status_code == 200
        data = res.json()
        today_entry = next((w for w in data.get('weekly_attendance', []) if w.get('date') == '2026-08-23'), None)
        if today_entry:
            assert today_entry.get('present') == 0
            assert today_entry.get('absent') == 0

        res2 = await client.get('/api/v1/admin/attendance/summary?date=2026-08-23', headers={'Authorization': f'Bearer {token}'})
        assert res2.status_code == 200
        summary = res2.json()
        assert summary.get('is_working_day') is False
        assert summary.get('total_students') == 0

        res3 = await client.get('/api/v1/attendance/faculty-summary?date=2026-08-23', headers={'Authorization': f'Bearer {token}'})
        assert res3.status_code == 200
        fac_summary = res3.json()
        assert fac_summary.get('is_working_day') is False
        assert fac_summary.get('present_count') == 0
        assert fac_summary.get('absent_count') == 0
        for rec in fac_summary.get('records', []):
            assert rec.get('status') in ['not_scheduled', 'unmarked']

@pytest.mark.asyncio
async def test_google_auth_distinguishes_errors_and_provisions_tenant():
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        res1 = await client.post('/api/v1/auth/google', json={'credential': ''})
        assert res1.status_code == 400

        res2 = await client.post('/api/v1/auth/google', json={'credential': 'invalid_random_string_12345'})
        assert res2.status_code == 401

        unique_suffix = uuid.uuid4().hex[:8]
        user_payload = {
            'iss': 'https://accounts.google.com',
            'sub': f'google_{unique_suffix}',
            'email': f'dean_{unique_suffix}@newuniv.edu',
            'name': 'Dean Winchester',
            'picture': 'https://lh3.googleusercontent.com/a/default',
            'email_verified': True,
            'exp': int(datetime.now(timezone.utc).timestamp()) + 3600,
        }
        b64_payload = base64.urlsafe_b64encode(json.dumps(user_payload).encode()).decode().rstrip('=')
        b64_header = base64.urlsafe_b64encode(json.dumps({'alg': 'RS256'}).encode()).decode().rstrip('=')
        token_jwt = f'{b64_header}.{b64_payload}.signature'

        from unittest.mock import patch
        with patch("app.api.v1.endpoints.auth.verify_google_credential", return_value=user_payload):
            res3 = await client.post('/api/v1/auth/google', json={'credential': 'valid_verified_google_token'})
            assert res3.status_code == 200
            data3 = res3.json()
            assert 'access_token' in data3
            new_token = data3['access_token']

            # Verify user profile via /auth/me
            res_me = await client.get('/api/v1/auth/me', headers={'Authorization': f'Bearer {new_token}'})
            assert res_me.status_code == 200
            user_data = res_me.json()
            assert user_data.get('email') == f'dean_{unique_suffix}@newuniv.edu'
            assert user_data.get('role') == 'admin'
            assert user_data.get('is_setup_complete') is False
            assert user_data.get('university_id').startswith('univ_')

@pytest.mark.asyncio
async def test_document_ocr_and_operational_routing():
    token = create_access_token('demo-judge@campusnova.com', role='admin')
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        dummy_png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=')
        files = {'file': ('student_leave_application_STU-001_2026-08-25.png', dummy_png, 'image/png')}
        res1 = await client.post('/api/v1/documents/extract', headers={'Authorization': f'Bearer {token}'}, files=files)
        assert res1.status_code == 200
        doc1 = res1.json()
        assert doc1.get('document_type') in ['STUDENT_LEAVE_FORM', 'LEAVE_APPLICATION']
        assert doc1.get('student_id') == 'STU-001'
        assert doc1.get('recommended_action') == 'MARK_EXCUSED_ATTENDANCE'

        unknown_files = {'file': ('random_abstract_diagram.png', dummy_png, 'image/png')}
        res2 = await client.post('/api/v1/documents/extract', headers={'Authorization': f'Bearer {token}'}, files=unknown_files)
        assert res2.status_code == 200
        doc2 = res2.json()
        assert doc2.get('document_type') == 'UNKNOWN'
        assert doc2.get('classification_confidence') < 0.50
        assert doc2.get('operational_effect') is None
