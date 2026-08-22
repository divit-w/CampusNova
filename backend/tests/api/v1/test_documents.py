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
        "document_category": "Leave Application",
        "summary": "Request for sick leave.",
        "extracted_fields": [
            {"key": "Student Name", "value": "Jane Doe", "confidence": "High"},
            {"key": "Admission Number", "value": "ADM-98765", "confidence": "Medium"}
        ],
        "requires_human_review": False
    })
    
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]

    with patch("app.api.v1.endpoints.documents.client.chat.completions.create", new_callable=AsyncMock) as mock_create, \
         patch("app.api.v1.endpoints.documents.document_service.index_document", new_callable=AsyncMock) as mock_index, \
         patch("app.api.v1.endpoints.documents.mongo_db.students_collection.find_one", new_callable=AsyncMock) as mock_mongo:
        mock_create.return_value = mock_response
        mock_mongo.return_value = {"full_name": "Jane Doe", "grade": "11A"}

        # Simulated image file bytes (must be > 5KB to pass the integrity gate)
        fake_bytes = b"fake_image_bytes" * 400
        files = {"file": ("test_image.png", fake_bytes, "image/png")}
        response = client.post("/api/v1/documents/extract", files=files)

        assert response.status_code == 200
        data = response.json()
        assert data["document_category"] == "Leave Application"
        assert data["summary"] == "Request for sick leave."
        assert len(data["extracted_fields"]) == 2
        assert data["extracted_fields"][0]["value"] == "Jane Doe"
        assert data["requires_human_review"] is False
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
