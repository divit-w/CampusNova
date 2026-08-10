import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

@patch("app.api.v1.knowledge.mongo_db.knowledge_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.knowledge.ingestion_service.process_and_store_pdf", new_callable=AsyncMock)
def test_upload_pdf_success(mock_process, mock_find_one):
    mock_find_one.return_value = None
    mock_process.return_value = {"document_id": "test-doc-123", "total_chunks": 3}
    
    files = {"file": ("test.pdf", b"%PDF-1.4 mock pdf data", "application/pdf")}
    response = client.post("/api/v1/knowledge/upload", files=files)
    
    assert response.status_code == 200
    data = response.json()
    assert "document_id" in data
    assert data["document_id"] == "test-doc-123"
    assert data["total_chunks"] == 3

@patch("app.api.v1.knowledge.mongo_db.knowledge_collection.find_one", new_callable=AsyncMock)
def test_upload_duplicate_hash_conflict(mock_find_one):
    from datetime import datetime, timezone
    mock_find_one.return_value = {
        "id": "existing-doc-1",
        "title": "test.pdf",
        "upload_date": datetime.now(timezone.utc),
        "total_chunks": 5,
        "file_hash": "mockedhash"
    }
    
    files = {"file": ("test.pdf", b"%PDF-1.4 duplicate", "application/pdf")}
    response = client.post("/api/v1/knowledge/upload", files=files)
    
    assert response.status_code == 409
    assert "Document already exists" in response.json()["detail"]["message"]

def test_upload_invalid_content_type():
    files = {"file": ("test.txt", b"plain text", "text/plain")}
    response = client.post("/api/v1/knowledge/upload", files=files)
    assert response.status_code == 422
    assert "Invalid file type" in response.json()["detail"]

def test_upload_file_too_large():
    # 15MB = 15728640. We need 16MB.
    large_content = b"0" * (16 * 1024 * 1024)
    files = {"file": ("large.pdf", large_content, "application/pdf")}
    response = client.post("/api/v1/knowledge/upload", files=files)
    assert response.status_code == 413
    assert response.json()["detail"] == "Payload Too Large"

@patch("app.api.v1.knowledge.openai_client.embeddings.create", new_callable=AsyncMock)
@patch("app.api.v1.knowledge.chroma_db.get_or_create_collection")
@patch("app.api.v1.knowledge.call_llm", new_callable=AsyncMock)
def test_query_knowledge_success(mock_call_llm, mock_get_collection, mock_embeddings):
    mock_embed_resp = MagicMock()
    mock_embed_resp.data = [MagicMock(embedding=[0.1, 0.2])]
    mock_embeddings.return_value = mock_embed_resp
    
    mock_collection = MagicMock()
    mock_collection.query.return_value = {
        "distances": [[0.2, 0.3]],
        "documents": [["Chunk A text", "Chunk B text"]],
        "metadatas": [[{"document_id": "doc1", "chunk_index": 0}, {"document_id": "doc1", "chunk_index": 1}]]
    }
    mock_get_collection.return_value = mock_collection
    
    import json
    mock_llm_resp = MagicMock()
    mock_llm_resp.choices = [MagicMock(message=MagicMock(content=json.dumps({"status": "success", "answer": "This is the answer."})))]
    mock_call_llm.return_value = mock_llm_resp
    
    response = client.post("/api/v1/knowledge/query", json={"query": "What is the attendance policy?"})
    assert response.status_code == 200
    data = response.json()
    assert data["query"] == "What is the attendance policy?"
    assert data["answer"] == "This is the answer."
    assert len(data["citations"]) == 2
    assert data["citations"][0]["document_id"] == "doc1"
    
@patch("app.api.v1.knowledge.openai_client.embeddings.create", new_callable=AsyncMock)
@patch("app.api.v1.knowledge.chroma_db.get_or_create_collection")
def test_query_database_failure_503(mock_get_collection, mock_embeddings):
    mock_embeddings.side_effect = Exception("OpenAI API error")
    
    response = client.post("/api/v1/knowledge/query", json={"query": "Will it fail?"})
    assert response.status_code == 503
    assert response.json()["detail"] == "Database service temporarily unavailable"
