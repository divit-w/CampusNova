import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import List, Literal

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


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def call_llm_text(messages: list, model: str):
    """Like call_llm but without forcing JSON mode.

    Used by the SUMMARIZE pathway where the LLM must return rich Markdown.
    Forcing ``response_format=json_object`` on free-tier OpenRouter models
    causes them to escape newlines inside the JSON string value, producing
    literal ``\\n`` characters in the rendered UI instead of real line breaks.
    Without JSON mode the model returns clean, unescaped Markdown directly.
    """
    response = await openai_client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.1,
    )
    return response


# ── Agentic Query Router ───────────────────────────────────────────────────

# Keyword heuristic — matches summarisation intent independently of the LLM.
_SUMMARIZE_RE = re.compile(
    r"\b(summarize|summarise|summary|summaries|overview|tldr|tl;dr|tl dr|"
    r"brief|outline|abstract|gist|recap|rundown|key\s+points?|main\s+points?|"
    r"what\s+is\s+this\s+(doc|document|file|about)|tell\s+me\s+about\s+this|"
    r"explain\s+this\s+(doc|document)|digest)\b",
    re.IGNORECASE,
)


async def classify_query_intent(query: str) -> Literal["SEARCH", "SUMMARIZE"]:
    """Route a user query to SEARCH or SUMMARIZE using a fast LLM call.

    The LLM is the primary decision maker. If it fails or returns something
    unexpected the regex heuristic takes over, ensuring zero-latency degradation.
    """
    # ── Primary: LLM intent classifier ──────────────────────────────────────
    router_prompt = (
        "You are an intent classification engine. "
        "Classify the user's query into exactly one of these two categories:\n\n"
        "  SEARCH     — The user wants a specific fact, policy, name, rule, or answer "
        "extracted from the indexed documents.\n"
        "  SUMMARIZE  — The user wants a high-level summary, overview, digest, or recap "
        "of a document.\n\n"
        "Return ONLY the single word 'SEARCH' or 'SUMMARIZE'. No other text."
    )
    try:
        router_resp = await openai_client.chat.completions.create(
            model=settings.EMBEDDING_MODEL.replace("text-embedding-", "gpt-").split("/")[-1]
            if "text-embedding" in settings.EMBEDDING_MODEL else "openai/gpt-4o-mini",
            messages=[
                {"role": "system", "content": router_prompt},
                {"role": "user", "content": query},
            ],
            temperature=0.0,
            max_tokens=5,
        )
        label = (router_resp.choices[0].message.content or "").strip().upper()
        if label in ("SEARCH", "SUMMARIZE"):
            logger.debug("Intent classifier → %s for query %r", label, query)
            return label  # type: ignore[return-value]
    except Exception as exc:
        logger.warning("Intent LLM failed (%s) — falling back to regex heuristic.", exc)

    # ── Fallback: Regex heuristic ────────────────────────────────────────────
    intent: Literal["SEARCH", "SUMMARIZE"] = (
        "SUMMARIZE" if _SUMMARIZE_RE.search(query) else "SEARCH"
    )
    logger.debug("Intent heuristic → %s for query %r", intent, query)
    return intent


async def _build_summarize_context(max_chars: int = 15_000) -> tuple[str, list[RAGCitation]]:
    """Fetch the most recent completed document and sample its chunks evenly.

    Samples chunks from the beginning, middle, and end of the document so the
    LLM gets representative coverage without blowing the context window.

    Returns:
        (context_text, citations)  — an empty string + [] if no docs are found.
    """
    # Most recently uploaded completed document
    doc_record = await mongo_db.knowledge_collection.find_one(
        {"indexing_status": "completed"},
        sort=[("upload_date", -1)],
    )
    if not doc_record:
        return "", []

    document_id: str = doc_record["id"]
    doc_title: str = doc_record.get("title", "Unknown Document")

    # Pull all child chunks for this document from ChromaDB
    collection = chroma_db.get_or_create_collection("student_documents")
    try:
        chunk_data = collection.get(
            where={"document_id": document_id},
            include=["documents", "metadatas"],
        )
    except Exception as exc:
        logger.warning("ChromaDB fetch for summarise failed: %s", exc)
        return "", []

    raw_docs: list[str] = chunk_data.get("documents") or []
    raw_metas: list[dict] = chunk_data.get("metadatas") or []

    if not raw_docs:
        return "", []

    # Sort by chunk_index so the sample is positionally meaningful
    paired = sorted(
        zip(raw_docs, raw_metas),
        key=lambda x: x[1].get("chunk_index", 0),
    )

    # Smart context windowing: evenly sample beginning, middle, and end
    n = len(paired)
    if n <= 9:
        selected = paired
    else:
        # Take 3 from start, 3 from mid, 3 from end — scales with collection size
        third = max(1, n // 3)
        selected = list(paired[:third]) + list(paired[n // 2 - third // 2: n // 2 + third // 2]) + list(paired[-third:])

    # Build context up to max_chars — use parent_text (large block) if available
    context_parts: list[str] = []
    chars_used = 0
    for child_text, meta in selected:
        block = meta.get("parent_text", child_text)
        if chars_used + len(block) > max_chars:
            remaining = max_chars - chars_used
            if remaining > 200:  # Only append if there's meaningful space left
                context_parts.append(block[:remaining])
            break
        context_parts.append(block)
        chars_used += len(block)

    context_text = "\n\n---\n\n".join(context_parts)

    # Return a single whole-document citation
    citations = [
        RAGCitation(
            document_id=document_id,
            source_file=doc_title,
            chunk_index=0,
            confidence_score=1.0,
            extracted_text=f"Full document summary of: {doc_title}",
        )
    ]
    return context_text, citations


async def _execute_summarize_path(query: str) -> RAGResponse:
    """Run the SUMMARIZE pathway: fetch doc, window context, call LLM."""
    context_text, citations = await _build_summarize_context()

    if not context_text:
        return RAGResponse(
            query=query,
            answer="No indexed documents were found. Please upload a PDF first.",
            citations=[],
        )

    summarize_system_prompt = (
        "You are an expert document analyst for a school ERP system. "
        "You will be given raw text excerpts from a school document such as a policy handbook, "
        "admission guide, or timetable.\n\n"
        "Your task: write a comprehensive, highly structured executive summary in **Markdown only**.\n\n"
        "FORMAT REQUIREMENTS (strictly follow — the UI renders Markdown):\n"
        "- Start with a single **bold** sentence summarising the document in one line.\n"
        "- Use `## ` headings for each major topic section.\n"
        "- Under each heading use `- ` bullet points for detail items.\n"
        "- Use `**bold**` for key terms, names, dates, and values.\n"
        "- Separate every heading, bullet list block, and paragraph with a blank line.\n"
        "- End with a `## Key Takeaways` section containing 3–5 bullet points.\n\n"
        "CONTENT RULES:\n"
        "- Use ONLY information present in the provided text.\n"
        "- If a section is unclear write: *Not specified in document.*\n"
        "- Do NOT invent, extrapolate, or hallucinate.\n"
        "- Aim for 400–700 words.\n\n"
        "Return ONLY the Markdown text. Do NOT wrap it in JSON. Do NOT add any preamble."
    )

    messages = [
        {"role": "system", "content": summarize_system_prompt},
        {"role": "user", "content": f"Document Excerpts:\n\n{context_text}\n\nUser Request: {query}"},
    ]

    try:
        resp = await call_llm_text(messages, "openrouter/free")
    except Exception as primary_e:
        logger.warning("Primary LLM failed for summarise: %s. Trying fallback.", primary_e)
        try:
            resp = await call_llm_text(messages, "openai/gpt-oss-20b:free")
        except Exception as secondary_e:
            logger.error("Secondary LLM also failed for summarise: %s", secondary_e)
            raise HTTPException(status_code=500, detail="LLM service unavailable")

    # The model returns raw Markdown — use it directly.
    # If for some reason the model wraps it in JSON anyway, attempt to unwrap.
    raw_content = (resp.choices[0].message.content or "").strip()
    if raw_content.startswith("{"):
        try:
            parsed = json.loads(raw_content)
            answer = parsed.get("answer", raw_content)
        except (json.JSONDecodeError, ValueError):
            answer = raw_content
    else:
        answer = raw_content

    if not answer:
        answer = "The model returned an empty response. Please try again."

    logger.info("Summarise path completed — answer length: %d chars", len(answer))
    return RAGResponse(query=query, answer=answer, citations=citations)


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

    # ── Agentic Intent Router ─────────────────────────────────────────────────
    # Classify the user's intent before doing any vector work.  SUMMARIZE
    # queries bypass ChromaDB entirely and go straight to the document-windowing
    # pathway; SEARCH queries continue through the full Hybrid RRF pipeline.
    intent = await classify_query_intent(request.query)
    logger.info("Query intent: %s for %r", intent, request.query)

    if intent == "SUMMARIZE":
        return await _execute_summarize_path(request.query)
    
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
        doc_id = hit["id"]
        meta   = hit["metadata"] or {}
        child_doc = hit["document"]
        rrf    = hit["rrf_score"]
        confidence = min(rrf / _RRF_MAX, 1.0)

        # Check if it's an OCR document (has document_category but no chunk_index)
        if "document_category" in meta and "chunk_index" not in meta:
            # It's an OCR doc. Fetch full fields from MongoDB to give LLM maximum context.
            kb_doc = await mongo_db.knowledge_collection.find_one({"document_id": doc_id})
            full_context = child_doc
            if kb_doc and "extracted_fields" in kb_doc:
                fields = "\n".join([f"- {f.get('key')}: {f.get('value')}" for f in kb_doc["extracted_fields"]])
                full_context += f"\n\nExtracted Details:\n{fields}"
                
            context_chunks.append(f"Document Category: {meta.get('document_category')} (Doc: {doc_id}):\n{full_context}")
            citations.append(RAGCitation(
                document_id=doc_id,
                source_file=f"Scanned {meta.get('document_category', 'Document')}",
                chunk_index=0,
                confidence_score=round(confidence, 4),
                extracted_text=child_doc,
            ))
            continue

        # Hierarchical retrieval: feed the LLM the full parent context block,
        # but deduplicate so we don't inject the same 2000-char block multiple times.
        parent_id = meta.get("parent_id")
        parent_text = meta.get("parent_text", child_doc)

        if parent_id:
            if parent_id not in seen_parents:
                seen_parents.add(parent_id)
                context_chunks.append(f"Context Block (Doc: {meta.get('document_id', doc_id)}):\n{parent_text}")
        else:
            # Fallback for old flat chunks
            context_chunks.append(f"Chunk {meta.get('chunk_index', 0)} (Doc: {meta.get('document_id', doc_id)}):\n{child_doc}")

        # The citation highlights the specific child chunk that matched
        citations.append(RAGCitation(
            document_id=meta.get("document_id", doc_id),
            source_file=meta.get("filename", "Unknown Document"),
            chunk_index=meta.get("chunk_index", 0),
            confidence_score=round(confidence, 4),
            extracted_text=child_doc,
        ))

    context_text = "\n\n".join(context_chunks)

    
    system_prompt = (
        "You are a precise RAG assistant for a school ERP system. "
        "Answer the user's query using ONLY the information from the provided context chunks. "
        "You MUST return a JSON object with exactly two keys: 'status' and 'answer'.\n\n"
        "CRITICAL FORMATTING RULES for the 'answer' string — the UI renders Markdown directly:\n"
        "- ALWAYS use double newlines (\\n\\n) between every paragraph, section, and list block.\n"
        "- Use **bold** for key terms, names, and important values.\n"
        "- Use `- ` (hyphen + space) or `• ` bullet points for lists. Each bullet on its own line.\n"
        "- Use numbered lists (`1.`, `2.`) for sequential steps.\n"
        "- Use `## ` headings to separate distinct topics when the answer covers multiple areas.\n"
        "- Keep every sentence concise. Never produce a wall of text — always break into scannable blocks.\n\n"
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
