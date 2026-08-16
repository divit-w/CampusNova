import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import List

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential

from app.api.v1.deps import require_roles
from app.core.config import settings
from app.services.ingestion_service import ingestion_service, client as openai_client
from app.services.mongo_service import mongo_db
from app.services.chroma_service import chroma_db
from app.schemas.knowledge import RAGResponse, RAGCitation

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15MB

class QueryRequest(BaseModel):
    query: str


class KnowledgeDocumentListItem(BaseModel):
    """A summary record of an uploaded knowledge document as stored in MongoDB."""
    id: str
    title: str
    total_chunks: int
    file_hash: str
    upload_date: str
    indexing_status: str = "completed"
    error_message: str | None = None


@router.get("/documents", response_model=List[KnowledgeDocumentListItem])
async def list_knowledge_documents(
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Returns a paginated list of all uploaded school knowledge documents.
    Consumed by the frontend Document Library page.
    """
    cursor = mongo_db.knowledge_collection.find({}, {"_id": 0}).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    result = []
    for d in docs:
        result.append(KnowledgeDocumentListItem(
            id=d.get("id", ""),
            title=d.get("title", "Untitled"),
            total_chunks=d.get("total_chunks", 0),
            file_hash=d.get("file_hash", d.get("sha256_hash", "")),
            upload_date=(
                d["upload_date"].isoformat()
                if isinstance(d.get("upload_date"), datetime)
                else str(d.get("upload_date", ""))
            ),
            indexing_status=d.get("indexing_status", "completed"),
            error_message=d.get("error_message"),
        ))
    return result


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_knowledge_document(
    doc_id: str,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Deletes a knowledge document from MongoDB and removes its associated
    vector embeddings from ChromaDB. Returns 204 No Content on success.
    """
    doc = await mongo_db.knowledge_collection.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found.")

    # Remove all vector chunks for this document from ChromaDB
    try:
        collection = chroma_db.get_or_create_collection("student_documents")
        # ChromaDB where filter to match all chunks with this document_id
        existing = collection.get(where={"document_id": doc_id})
        if existing and existing.get("ids") and len(existing["ids"]) > 0:
            collection.delete(ids=existing["ids"])
    except Exception as e:
        logger.warning(f"ChromaDB cleanup for doc {doc_id} failed: {e}. Proceeding with MongoDB delete.")

    # Remove the document record from MongoDB
    await mongo_db.knowledge_collection.delete_one({"id": doc_id})
    return None  # 204 No Content

from fastapi import BackgroundTasks
import uuid

@router.post("/upload", status_code=202)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=422, detail="Invalid file type. Only PDF is allowed.")

    file_size = 0
    hasher = hashlib.sha256()
    file_bytes = b""
    
    while chunk := await file.read(8192):
        file_size += len(chunk)
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="Payload Too Large")
        hasher.update(chunk)
        file_bytes += chunk
        
    file_hash = hasher.hexdigest()
    
    # Check deduplication
    existing = await mongo_db.knowledge_collection.find_one({"sha256_hash": file_hash})
    if existing:
        raise HTTPException(
            status_code=409, 
            detail={
                "message": "Document already exists", 
                "original_id": existing["id"], 
                "title": existing["title"], 
                "upload_date": existing["upload_date"].isoformat() if isinstance(existing["upload_date"], datetime) else existing["upload_date"]
            }
        )

    document_id = str(uuid.uuid4())
    
    # Create the initial MongoDB record in "processing" status
    from app.schemas.knowledge import KnowledgeDocument
    record = KnowledgeDocument(
        id=document_id,
        title=file.filename,
        upload_date=datetime.now(timezone.utc),
        total_chunks=0,
        sha256_hash=file_hash,
        indexing_status="processing",
        error_message=None
    )
    await mongo_db.knowledge_collection.insert_one(record.model_dump())
    
    # Dispatch heavy processing to the background
    background_tasks.add_task(
        ingestion_service.process_and_store_pdf,
        file_bytes, file.filename, file_hash, document_id
    )
        
    now = datetime.now(timezone.utc).isoformat()
    logger.info(f"[{now}] Accepted document {file.filename} for background ingestion with id {document_id}")
    
    return {"message": "Upload accepted and processing in background", "document_id": document_id, "status": "processing"}


@router.get("/documents/{document_id}/status")
async def get_document_status(
    document_id: str,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Polls the indexing progress of a document by its ID.
    Returns processing, completed, or failed (along with any error_message).
    """
    doc = await mongo_db.knowledge_collection.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    return {
        "id": doc.get("id"),
        "title": doc.get("title", ""),
        "indexing_status": doc.get("indexing_status", "completed"),
        "total_chunks": doc.get("total_chunks", 0),
        "error_message": doc.get("error_message")
    }


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def call_llm(messages: list, model: str):
    response = await openai_client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.1,
        response_format={"type": "json_object"}
    )
    return response


# ── Hybrid search helpers ──────────────────────────────────────────────────

def _keyword_search(collection, query: str, n_results: int = 8) -> list[dict]:
    """TF-IDF keyword search across ALL stored ChromaDB chunks.

    Retrieves every chunk via ``collection.get()``, fits a TF-IDF vectorizer,
    and returns the top-n chunks ranked by cosine similarity to the query.

    Returns an empty list on any failure (empty collection, vectorizer error,
    etc.) so callers degrade gracefully to semantic-only search.
    """
    try:
        all_data = collection.get(include=["documents", "metadatas"])
        docs: list[str] = all_data.get("documents") or []
        metas: list[dict] = all_data.get("metadatas") or []
        ids: list[str] = all_data.get("ids") or []

        # Guard: must be a real list of strings (not a test mock object)
        if not isinstance(docs, list) or not docs:
            return []

        vectorizer = TfidfVectorizer(
            sublinear_tf=True,      # log(1+tf) — dampens common term dominance
            stop_words="english",
            min_df=1,
        )
        tfidf_matrix = vectorizer.fit_transform(docs)
        query_vec = vectorizer.transform([query])
        scores: np.ndarray = (tfidf_matrix @ query_vec.T).toarray().flatten()

        top_indices = np.argsort(scores)[::-1][:n_results]
        return [
            {
                "id": ids[i],
                "document": docs[i],
                "metadata": metas[i],
                "score": float(scores[i]),
            }
            for i in top_indices
            if scores[i] > 0   # skip zero-scoring (no term overlap at all)
        ]
    except Exception as exc:
        logger.warning("Keyword search failed, falling back to semantic-only: %s", exc)
        return []


def _rrf_merge(
    semantic_hits: list[dict],
    keyword_hits: list[dict],
    k: int = 60,
    top_n: int = 8,
) -> list[dict]:
    """Reciprocal Rank Fusion of semantic and keyword result lists.

    RRF score(d) = Σ_{r in {semantic, keyword}} 1 / (k + rank(d, r))

    k=60 is the constant from the original RRF paper (Cormack et al. 2009).
    Higher k reduces the influence of top-ranked items; 60 is the community
    standard that works well across recall/precision trade-offs.

    Returns up to ``top_n`` merged items sorted by descending RRF score.
    Each item carries a ``rrf_score`` field used for confidence scoring.
    """
    rrf_scores: dict[str, float] = {}
    item_by_id: dict[str, dict] = {}

    for rank, hit in enumerate(semantic_hits):
        doc_id = hit["id"]
        rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
        item_by_id[doc_id] = hit  # preserves 'distance' from semantic search

    for rank, hit in enumerate(keyword_hits):
        doc_id = hit["id"]
        rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
        if doc_id not in item_by_id:
            # Keyword-only hit — no semantic distance available
            item_by_id[doc_id] = {
                "id": doc_id,
                "document": hit["document"],
                "metadata": hit["metadata"],
                "distance": None,
            }

    ranked = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:top_n]
    return [{**item_by_id[doc_id], "rrf_score": score} for doc_id, score in ranked]


@router.post("/query", response_model=RAGResponse)
async def query_knowledge(request: QueryRequest):
    start_time = datetime.now(timezone.utc)
    
    try:
        # Generate query embeddings
        embed_resp = await openai_client.embeddings.create(
            input=[request.query],
            model=settings.EMBEDDING_MODEL
        )
        query_embedding = embed_resp.data[0].embedding
        
        # ── Stage 1: Semantic vector search ───────────────────────────────
        # Fetch a wider candidate pool (top 10) so RRF has more material to
        # rerank; the merge step is the quality gate, not n_results alone.
        collection = chroma_db.get_or_create_collection("student_documents")
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=10,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as e:
        logger.error(f"Database error during query: {e}")
        raise HTTPException(status_code=503, detail="Database service temporarily unavailable")

    # Flatten semantic results into the common hit schema used by _rrf_merge.
    sem_ids       = results.get("ids", [[]])[0]
    sem_documents = results.get("documents", [[]])[0]
    sem_metadatas = results.get("metadatas", [[]])[0]
    sem_distances = results.get("distances", [[]])[0]

    semantic_hits = [
        {"id": doc_id, "document": doc, "metadata": meta, "distance": dist}
        for doc_id, doc, meta, dist in zip(sem_ids, sem_documents, sem_metadatas, sem_distances)
    ]

    # ── Stage 2: Keyword (TF-IDF) search ──────────────────────────────────
    keyword_hits = _keyword_search(collection, request.query, n_results=10)

    # ── Stage 3: Reciprocal Rank Fusion ───────────────────────────────────
    merged_hits = _rrf_merge(semantic_hits, keyword_hits, k=60, top_n=8)

    logger.debug(
        "Hybrid search — semantic: %d, keyword: %d, merged: %d",
        len(semantic_hits), len(keyword_hits), len(merged_hits),
    )

    # ── Build context and citations from merged results ────────────────────
    # RRF max score = 2/(k+1) ≈ 0.033 (doc ranked #1 in both lists).
    # Normalise to [0, 1] for the confidence_score field.
    _RRF_MAX = 2.0 / (60 + 1)

    context_chunks: list[str] = []
    citations: list[RAGCitation] = []
    seen_parents = set()

    for hit in merged_hits:
        meta   = hit["metadata"]
        child_doc = hit["document"]
        rrf    = hit["rrf_score"]
        confidence = min(rrf / _RRF_MAX, 1.0)

        # Hierarchical retrieval: feed the LLM the full parent context block,
        # but deduplicate so we don't inject the same 2000-char block multiple times.
        parent_id = meta.get("parent_id")
        parent_text = meta.get("parent_text", child_doc)

        if parent_id:
            if parent_id not in seen_parents:
                seen_parents.add(parent_id)
                context_chunks.append(f"Context Block (Doc: {meta['document_id']}):\n{parent_text}")
        else:
            # Fallback for old flat chunks
            context_chunks.append(f"Chunk {meta['chunk_index']} (Doc: {meta['document_id']}):\n{child_doc}")

        # The citation highlights the specific child chunk that matched
        citations.append(RAGCitation(
            document_id=meta["document_id"],
            source_file=meta.get("filename", "Unknown Document"),
            chunk_index=meta["chunk_index"],
            confidence_score=round(confidence, 4),
            extracted_text=child_doc,
        ))

    context_text = "\n\n".join(context_chunks)

    
    system_prompt = (
        "You are a precise RAG assistant for a school ERP system. "
        "Answer the user's query using ONLY the information from the provided context chunks. "
        "You MUST return a JSON object with exactly two keys: 'status' and 'answer'.\n\n"
        "FORMATTING RULES for the 'answer' string:\n"
        "- Use bullet points (•) or numbered lists for any enumeration of items or steps.\n"
        "- Separate distinct sections or ideas with a blank line (\\n\\n).\n"
        "- Keep sentences concise. Avoid dense walls of text.\n"
        "- If citing multiple facts, present each on its own line.\n\n"
        "STATUS RULES:\n"
        "- Set 'status' to 'success' if the context contains a useful answer.\n"
        "- If the context does not contain the answer, return EXACTLY: "
        '{"status": "unsupported", "answer": "I cannot find the answer based on the provided documents."}'
    )
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Context:\n{context_text}\n\nQuery: {request.query}"}
    ]
    
    try:
        resp = await call_llm(messages, "openrouter/free")
    except Exception as primary_e:
        logger.warning(f"Primary LLM failed after 3 attempts: {primary_e}. Falling back to secondary model.")
        try:
            resp = await call_llm(messages, "openai/gpt-oss-20b:free")
        except Exception as secondary_e:
            logger.error(f"Secondary LLM also failed: {secondary_e}")
            raise HTTPException(status_code=500, detail="LLM service unavailable")
            
    # Three-tier JSON fallback parser
    # Tier 1 — strict: LLM returned a well-formed JSON object.
    # Tier 2 — lenient: LLM returned prose with an embedded JSON object; extract it.
    # Tier 3 — plain-text: LLM refused / returned a safety message; surface it as-is.
    content: dict = {}
    raw_content = resp.choices[0].message.content or ""
    try:
        content = json.loads(raw_content)
        answer = content.get("answer", raw_content)
    except (json.JSONDecodeError, ValueError):
        # Tier 2 — look for {...} anywhere in the raw string
        json_match = re.search(r"\{.*\}", raw_content, re.DOTALL)
        if json_match:
            try:
                content = json.loads(json_match.group())
                answer = content.get("answer", raw_content)
            except (json.JSONDecodeError, ValueError):
                content = {"status": "success", "answer": raw_content}
                answer = raw_content
        else:
            # Tier 3 — plain text (refusals, safety messages, etc.)
            logger.warning(
                "LLM returned non-JSON content for query %r — surfacing as plain-text answer. Raw: %r",
                request.query,
                raw_content,
            )
            content = {"status": "success", "answer": raw_content}
            answer = raw_content

    # ── Safety-refusal guard ───────────────────────────────────────────────
    # Some OpenRouter models prepend internal safety annotations or refusal
    # strings instead of (or before) the JSON payload.  Detect these and
    # replace them with a clean, user-facing message rather than leaking
    # internal system strings into the UI.
    _SAFETY_SIGNALS = (
        "user safety:",
        "i'm sorry, i can't",
        "i cannot assist",
        "i'm unable to",
        "i'm not able to",
        "as an ai",
        "this request has been flagged",
        "content policy",
    )
    if any(sig in answer.lower() for sig in _SAFETY_SIGNALS):
        logger.warning(
            "Safety refusal detected for query %r. Raw answer: %r", request.query, answer
        )
        answer = (
            "The model declined to process this query due to safety filters. "
            "Please rephrase your question and try again."
        )
        content = {"status": "unsupported"}
        citations = []

    if content.get("status") == "unsupported":
        citations = []
        
    end_time = datetime.now(timezone.utc)
    duration = (end_time - start_time).total_seconds()
    logger.info(f"[{end_time.isoformat()}] Query executed in {duration} seconds: {request.query}")
    
    return RAGResponse(
        query=request.query,
        answer=answer,
        citations=citations
    )
