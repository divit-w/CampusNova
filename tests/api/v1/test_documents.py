import json
from unittest.mock import patch, AsyncMock, MagicMock
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

def test_extract_document_success():
    """Test successful document extraction with a mocked AsyncOpenAI response."""
    mock_choice = MagicMock()
    mock_choice.message.content = json.dumps({
        "student_name": "Jane Doe",
        "admission_number": "ADM-98765",
        "grade_level": 11,
        "confidence_scores": {
            "student_name": 0.99,
            "admission_number": 0.97
        },
        "requires_review": False
    })
    
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]

    with patch("app.api.v1.endpoints.documents.client.chat.completions.create", new_callable=AsyncMock) as mock_create, \
         patch("app.api.v1.endpoints.documents.document_service.index_document") as mock_index:
        mock_create.return_value = mock_response

        # Simulated image file bytes
        files = {"file": ("test_image.png", b"fake_image_bytes", "image/png")}
        response = client.post("/api/v1/documents/extract", files=files)

        assert response.status_code == 200
        data = response.json()
        assert data["student_name"] == "Jane Doe"
        assert data["admission_number"] == "ADM-98765"
        assert data["grade_level"] == 11
        assert data["confidence_scores"]["student_name"] == 0.99
        assert data["requires_review"] is False
        assert "document_id" in data
        assert isinstance(data["document_id"], str)
        
        mock_create.assert_called_once()
        mock_index.assert_called_once()

def test_extract_document_validation_error_non_image():
    """Test 422 validation error when uploading a non-image file (e.g. text file)."""
    files = {"file": ("test_document.txt", b"plain text content", "text/plain")}
    response = client.post("/api/v1/documents/extract", files=files)

    assert response.status_code == 422
    assert "detail" in response.json()

def test_extract_document_validation_error_missing_file():
    """Test 422 validation error when no file payload is provided."""
    response = client.post("/api/v1/documents/extract")

    assert response.status_code == 422
    assert "detail" in response.json()
