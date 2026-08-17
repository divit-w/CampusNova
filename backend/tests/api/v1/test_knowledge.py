import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

@patch("app.api.v1.knowledge.mongo_db.knowledge_collection.insert_one", new_callable=AsyncMock)
@patch("app.api.v1.knowledge.mongo_db.knowledge_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.knowledge.ingestion_service.process_and_store_pdf", new_callable=AsyncMock)
def test_upload_pdf_success(mock_process, mock_find_one, mock_insert):
    mock_find_one.return_value = None
    # We no longer expect process_and_store_pdf to return anything synchronously to the route
    
    files = {"file": ("test.pdf", b"%PDF-1.4 mock pdf data", "application/pdf")}
    response = client.post("/api/v1/knowledge/upload", files=files)
    
    assert response.status_code == 202
    data = response.json()
    assert "document_id" in data
    assert data["status"] == "processing"
    
    # Assert background task was called with the correct bytes
    mock_process.assert_called_once()
    mock_insert.assert_called_once()

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
    # ContentSizeLimitMiddleware intercepts before the endpoint; message includes size detail
    assert "Payload Too Large" in response.json()["detail"]

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
        "metadatas": [[{"document_id": "doc1", "chunk_index": 0}, {"document_id": "doc1", "chunk_index": 1}]],
        "ids": [["id1", "id2"]]
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


@patch("app.api.v1.knowledge.openai_client.embeddings.create", new_callable=AsyncMock)
@patch("app.api.v1.knowledge.chroma_db.get_or_create_collection")
@patch("app.api.v1.knowledge.call_llm", new_callable=AsyncMock)
def test_knowledge_rag_unparseable_json_fallback(mock_call_llm, mock_get_collection, mock_embeddings):
    """
    Regression test for the UnboundLocalError bug:
    When the LLM returns malformed/non-JSON content, json.loads() raises an exception.
    The endpoint must NOT crash with UnboundLocalError on the subsequent content.get() call.
    It must return 200 with a clean fallback answer string.
    """
    mock_embed_resp = MagicMock()
    mock_embed_resp.data = [MagicMock(embedding=[0.1, 0.2])]
    mock_embeddings.return_value = mock_embed_resp

    mock_collection = MagicMock()
    mock_collection.query.return_value = {
        "distances": [[0.1]],
        "documents": [["Some relevant chunk"]],
        "metadatas": [[{"document_id": "doc1", "chunk_index": 0}]],
    }
    mock_get_collection.return_value = mock_collection

    # Simulate LLM returning completely malformed non-JSON output
    mock_llm_resp = MagicMock()
    mock_llm_resp.choices = [
        MagicMock(message=MagicMock(content="INVALID_JSON{{{"))
    ]
    mock_call_llm.return_value = mock_llm_resp

    response = client.post("/api/v1/knowledge/query", json={"query": "What is the policy?"})

    # Must NOT be 500 — the UnboundLocalError must be fully suppressed
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.json()}"
    data = response.json()
    # The fallback answer must be a non-empty string, not a crash
    assert isinstance(data["answer"], str)
    assert len(data["answer"]) > 0
    assert "query" in data


@patch("app.api.v1.knowledge.mongo_db.knowledge_collection.find")
def test_list_knowledge_documents(mock_find):
    from datetime import datetime, timezone
    mock_cursor = MagicMock()
    mock_cursor.skip.return_value = mock_cursor
    mock_cursor.limit.return_value = mock_cursor
    mock_cursor.to_list = AsyncMock(return_value=[
        {
            "id": "doc123",
            "title": "Handbook.pdf",
            "total_chunks": 42,
            "sha256_hash": "deadbeef",
            "upload_date": datetime(2025, 1, 1, tzinfo=timezone.utc)
        }
    ])
    mock_find.return_value = mock_cursor

    from app.api.v1.deps import get_current_user
    app.dependency_overrides[get_current_user] = lambda: {"id": "test", "role": "admin"}
    
    response = client.get("/api/v1/knowledge/documents")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == "doc123"
    
    app.dependency_overrides.clear()


@patch("app.api.v1.knowledge.mongo_db.knowledge_collection.find_one", new_callable=AsyncMock)
@patch("app.api.v1.knowledge.mongo_db.knowledge_collection.delete_one", new_callable=AsyncMock)
@patch("app.api.v1.knowledge.chroma_db.get_or_create_collection")
def test_delete_knowledge_document_success(mock_get_collection, mock_delete, mock_find_one):
    mock_find_one.return_value = {"id": "doc123", "title": "Handbook.pdf"}
    
    mock_collection = MagicMock()
    mock_collection.get.return_value = {"ids": ["doc123_0", "doc123_1"]}
    mock_get_collection.return_value = mock_collection
    
    from app.api.v1.deps import get_current_user
    app.dependency_overrides[get_current_user] = lambda: {"id": "test", "role": "admin"}
    
    response = client.delete("/api/v1/knowledge/documents/doc123")
    assert response.status_code == 204
    mock_collection.delete.assert_called_once_with(ids=["doc123_0", "doc123_1"])
    mock_delete.assert_called_once_with({"id": "doc123"})
    
    app.dependency_overrides.clear()


@patch("app.api.v1.knowledge.mongo_db.knowledge_collection.find_one", new_callable=AsyncMock)
def test_get_document_status(mock_find_one):
    mock_find_one.return_value = {
        "id": "doc123",
        "title": "Handbook.pdf",
        "indexing_status": "completed",
        "total_chunks": 5,
        "error_message": None
    }
    
    from app.api.v1.deps import get_current_user
    app.dependency_overrides[get_current_user] = lambda: {"id": "test", "role": "admin"}
    
    response = client.get("/api/v1/knowledge/documents/doc123/status")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "doc123"
    assert data["indexing_status"] == "completed"
    assert data["total_chunks"] == 5
    
    app.dependency_overrides.clear()


# ── Agentic Query Router tests ─────────────────────────────────────────────

import pytest
import asyncio
from app.api.v1.knowledge import classify_query_intent, _SUMMARIZE_RE


@pytest.mark.asyncio
@patch("app.api.v1.knowledge.openai_client.chat.completions.create", new_callable=AsyncMock)
async def test_classify_intent_summarize_via_llm(mock_create):
    mock_create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content="SUMMARIZE"))]
    )
    result = await classify_query_intent("Give me an overview of the document")
    assert result == "SUMMARIZE"


@pytest.mark.asyncio
@patch("app.api.v1.knowledge.openai_client.chat.completions.create", new_callable=AsyncMock)
async def test_classify_intent_search_via_llm(mock_create):
    mock_create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content="SEARCH"))]
    )
    result = await classify_query_intent("What is the late-arrival policy?")
    assert result == "SEARCH"


@pytest.mark.asyncio
@patch("app.api.v1.knowledge.openai_client.chat.completions.create", new_callable=AsyncMock)
async def test_classify_intent_llm_failure_fallback_summarize(mock_create):
    mock_create.side_effect = Exception("timeout")
    result = await classify_query_intent("Can you summarize this document?")
    assert result == "SUMMARIZE"


@pytest.mark.asyncio
@patch("app.api.v1.knowledge.openai_client.chat.completions.create", new_callable=AsyncMock)
async def test_classify_intent_llm_failure_fallback_search(mock_create):
    mock_create.side_effect = Exception("timeout")
    result = await classify_query_intent("Who is the principal?")
    assert result == "SEARCH"


def test_summarize_regex_patterns():
    assert _SUMMARIZE_RE.search("summarize this document")
    assert _SUMMARIZE_RE.search("Give me a TL;DR")
    assert _SUMMARIZE_RE.search("what are the key points?")
    assert _SUMMARIZE_RE.search("give me an overview")
    assert _SUMMARIZE_RE.search("tell me about this document")
    assert not _SUMMARIZE_RE.search("What is the attendance policy?")
    assert not _SUMMARIZE_RE.search("Who is the principal?")


@patch("app.api.v1.knowledge.classify_query_intent", new_callable=AsyncMock)
@patch("app.api.v1.knowledge.mongo_db.knowledge_collection.find_one", new_callable=AsyncMock)
def test_query_summarize_no_docs_returns_graceful_message(mock_find_one, mock_intent):
    mock_intent.return_value = "SUMMARIZE"
    mock_find_one.return_value = None
    response = client.post("/api/v1/knowledge/query", json={"query": "summarize the handbook"})
    assert response.status_code == 200
    data = response.json()
    assert "No indexed documents" in data["answer"]
    assert data["citations"] == []


@patch("app.api.v1.knowledge.call_llm_text", new_callable=AsyncMock)
@patch("app.api.v1.knowledge.classify_query_intent", new_callable=AsyncMock)
@patch("app.api.v1.knowledge.chroma_db.get_or_create_collection")
@patch("app.api.v1.knowledge.mongo_db.knowledge_collection.find_one", new_callable=AsyncMock)
def test_query_summarize_happy_path(mock_find_one, mock_get_collection, mock_intent, mock_llm):
    from datetime import datetime, timezone
    mock_intent.return_value = "SUMMARIZE"
    mock_find_one.return_value = {
        "id": "doc-abc",
        "title": "School Handbook.pdf",
        "indexing_status": "completed",
        "upload_date": datetime.now(timezone.utc),
    }
    mock_collection = MagicMock()
    mock_collection.get.return_value = {
        "documents": ["Chapter 1 text here.", "Chapter 2 text here."],
        "metadatas": [
            {"chunk_index": 0, "parent_text": "Parent block 1", "filename": "School Handbook.pdf"},
            {"chunk_index": 1, "parent_text": "Parent block 2", "filename": "School Handbook.pdf"},
        ],
    }
    mock_get_collection.return_value = mock_collection
    # call_llm_text returns raw Markdown — no JSON wrapper
    mock_llm.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(
            content="## Summary\n\n- Key point 1\n- Key point 2\n\n## Key Takeaways\n\n- Takeaway 1"
        ))]
    )
    response = client.post("/api/v1/knowledge/query", json={"query": "give me a summary"})
    assert response.status_code == 200
    data = response.json()
    assert "Summary" in data["answer"] or "Key point" in data["answer"]
    assert len(data["citations"]) == 1
    assert data["citations"][0]["source_file"] == "School Handbook.pdf"
    assert data["citations"][0]["confidence_score"] == 1.0
