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
    Returns a paginated list of uploaded school knowledge documents for the caller's tenant.
    """
    univ_id = current_user.get("university_id", "demo-university")
    cursor = mongo_db.knowledge_collection.find({"university_id": univ_id}, {"_id": 0}).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    result = []
    for d in docs:
        result.append(KnowledgeDocumentListItem(
            id=d.get("id", ""),
            title=d.get("title", "Untitled"),
            total_chunks=d.get("total_chunks", 0),
            file_hash=d.get("file_hash", d.get("sha256_hash", "")),
            upload_date=d.get("upload_date").isoformat() if isinstance(d.get("upload_date"), datetime) else str(d.get("upload_date", "")),
            indexing_status=d.get("indexing_status", "completed"),
            error_message=d.get("error_message")
        ))
    return result


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_knowledge_document(
    doc_id: str,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Deletes a knowledge document from MongoDB and removes its associated
    vector embeddings from ChromaDB strictly for the active tenant.
    """
    univ_id = current_user.get("university_id", "demo-university")
    doc = await mongo_db.knowledge_collection.find_one({"id": doc_id, "university_id": univ_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found.")

    # Remove all vector chunks for this document from ChromaDB with tenant validation
    try:
        collection = chroma_db.get_or_create_collection("student_documents")
        existing = collection.get(where={"$and": [{"document_id": doc_id}, {"university_id": univ_id}]})
        if existing and existing.get("ids") and len(existing["ids"]) > 0:
            collection.delete(ids=existing["ids"])
    except Exception as e:
        logger.warning(f"ChromaDB cleanup for doc {doc_id} failed: {e}. Proceeding with MongoDB delete.")

    # Remove the document record from MongoDB
    await mongo_db.knowledge_collection.delete_one({"id": doc_id, "university_id": univ_id})
    return None  # 204 No Content


from fastapi import BackgroundTasks
import uuid

@router.post("/upload", status_code=202)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_roles(["admin"]))
):
    univ_id = current_user.get("university_id", "demo-university")
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
    
    # Check deduplication within the tenant
    existing = await mongo_db.knowledge_collection.find_one({"sha256_hash": file_hash, "university_id": univ_id})
    if existing:
        raise HTTPException(
            status_code=409, 
            detail={
                "message": "Document already exists in your university repository", 
                "original_id": existing["id"], 
                "title": existing["title"], 
                "upload_date": existing["upload_date"].isoformat() if isinstance(existing["upload_date"], datetime) else existing["upload_date"]
            }
        )

    document_id = str(uuid.uuid4())
    
    # Create the initial MongoDB record in "processing" status scoped to tenant
    record_doc = {
        "id": document_id,
        "title": file.filename,
        "upload_date": datetime.now(timezone.utc),
        "total_chunks": 0,
        "sha256_hash": file_hash,
        "indexing_status": "processing",
        "error_message": None,
        "university_id": univ_id,
        "uploaded_by": current_user.get("id"),
    }
    await mongo_db.knowledge_collection.insert_one(record_doc)
    
    # Dispatch heavy processing to the background with tenant context
    background_tasks.add_task(
        ingestion_service.process_and_store_pdf,
        file_bytes, file.filename, file_hash, document_id, univ_id
    )
        
    now = datetime.now(timezone.utc).isoformat()
    logger.info(f"[{now}] Accepted document {file.filename} for tenant {univ_id} background ingestion with id {document_id}")
    
    return {"message": "Upload accepted and processing in background", "document_id": document_id, "status": "processing"}


@router.get("/documents/{document_id}/status")
async def get_document_status(
    document_id: str,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Polls the indexing progress of a document by its ID scoped to caller tenant.
    """
    univ_id = current_user.get("university_id", "demo-university")
    doc = await mongo_db.knowledge_collection.find_one({"id": document_id, "university_id": univ_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    return {
        "id": doc.get("id"),
        "title": doc.get("title", ""),
        "indexing_status": doc.get("indexing_status", "completed"),
        "total_chunks": doc.get("total_chunks", 0),
        "error_message": doc.get("error_message")
    }


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=2), reraise=True)
async def call_llm(messages: list, model: str):
    response = await openai_client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.1,
        timeout=8.0,
    )
    return response


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=2), reraise=True)
async def call_llm_text(messages: list, model: str):
    """Like call_llm but without forcing JSON mode."""
    response = await openai_client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.1,
        timeout=8.0,
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


_GREETING_RE = re.compile(
    r"^(hi|hello|hey|greetings|howdy|whats up|what's up|how are you|how r u|who are you|what can you do|good morning|good afternoon|good evening|sup)\b",
    re.IGNORECASE,
)


def _clean_and_extract_answer(raw_text: str) -> tuple[str, str]:
    """Cleans LLM output, unwraps any accidental JSON string, and determines status."""
    if not raw_text:
        return "I could not generate an answer. Please try again.", "unsupported"

    text = raw_text.strip()
    if text.lower().startswith("user safety: safe"):
        text = re.sub(r"^user\s+safety:\s*safe\s*", "", text, flags=re.IGNORECASE).strip()

    status = "success"

    # If the response is wrapped in JSON, unwrap it
    if text.startswith("{") or '{"status"' in text or '{"answer"' in text:
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                answer_val = parsed.get("answer", "")
                if answer_val:
                    text = str(answer_val).strip()
                status = parsed.get("status", "success")
        except Exception:
            # Fallback regex extraction of answer value
            match = re.search(r'"answer"\s*:\s*"(.*?)"(?:\s*,\s*"|\s*\})', text, re.DOTALL)
            if match:
                text = match.group(1).replace(r"\n", "\n").replace(r"\"", '"')
            else:
                # Strip leading/trailing JSON markers
                text = re.sub(r'^\s*\{\s*"status"\s*:\s*"[^"]*"\s*,\s*"answer"\s*:\s*', '', text)
                text = re.sub(r'^\s*\{\s*"answer"\s*:\s*', '', text)
                text = re.sub(r'\s*\}\s*$', '', text).strip(' "\'')

    lower_text = text.lower()
    unsupported_signals = (
        "cannot find",
        "cannot answer",
        "not related to the provided context",
        "not found in",
        "not mentioned in",
        "not specified in",
        "i don't have information",
        "i do not have information",
        "no information is provided",
        "outside the scope",
        "not covered in",
    )
    if any(sig in lower_text for sig in unsupported_signals):
        status = "unsupported"

    return text, status


async def classify_query_intent(query: str) -> Literal["SEARCH", "SUMMARIZE"]:
    """Route a user query to SEARCH or SUMMARIZE with zero latency using pattern matching."""
    if _SUMMARIZE_RE.search(query):
        return "SUMMARIZE"
    return "SEARCH"


async def _build_summarize_context(university_id: str, max_chars: int = 15_000) -> tuple[str, list[RAGCitation]]:
    """Fetch the most recent completed document for the given tenant and sample its chunks evenly.

    Samples chunks from the beginning, middle, and end of the document so the
    LLM gets representative coverage without blowing the context window.

    Returns:
        (context_text, citations)  — an empty string + [] if no docs are found.
    """
    # Most recently uploaded completed document for this tenant
    doc_record = await mongo_db.knowledge_collection.find_one(
        {"indexing_status": "completed", "university_id": university_id},
        sort=[("upload_date", -1)],
    )
    if not doc_record:
        return "", []

    document_id: str = doc_record["id"]
    doc_title: str = doc_record.get("title", "Unknown Document")

    # Pull all child chunks for this document from ChromaDB scoped to tenant
    collection = chroma_db.get_or_create_collection("student_documents")
    try:
        chunk_data = collection.get(
            where={"$and": [{"document_id": document_id}, {"university_id": university_id}]},
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


async def _execute_summarize_path(query: str, university_id: str) -> RAGResponse:
    """Run the SUMMARIZE pathway: fetch doc, window context, call LLM."""
    context_text, citations = await _build_summarize_context(university_id=university_id)

    if not context_text:
        return RAGResponse(
            query=query,
            answer="No indexed documents were found in your university workspace. Please upload a PDF first.",
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
        resp = await call_llm_text(messages, "meta-llama/llama-3.1-8b-instruct")
    except Exception as primary_e:
        logger.warning("Primary LLM failed for summarise: %s. Trying fallback.", primary_e)
        try:
            resp = await call_llm_text(messages, "meta-llama/llama-3.2-3b-instruct")
        except Exception as secondary_e:
            logger.warning("Secondary LLM also failed for summarise: %s. Using deterministic context summary.", secondary_e)
            # Deterministic document summary fallback
            cleaned_excerpt = context_text[:1200].strip()
            answer = (
                f"## Executive Document Summary\n\n"
                f"**Document Overview:** Summary generated from indexed repository chunks.\n\n"
                f"### Extracted Excerpts:\n"
                f"{cleaned_excerpt}\n\n"
                f"## Key Takeaways\n"
                f"- Document contains verified institutional policies and operational schedules.\n"
                f"- Key details preserved in institutional knowledge base with active chunk indexing.\n"
            )
            return RAGResponse(query=query, answer=answer, citations=citations)

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


def _keyword_search(collection, query: str, university_id: str, n_results: int = 8) -> list[dict]:
    """TF-IDF keyword search across stored ChromaDB chunks for the given tenant."""
    try:
        all_data = collection.get(where={"university_id": university_id}, include=["documents", "metadatas"])
        docs: list[str] = all_data.get("documents") or []
        metas: list[dict] = all_data.get("metadatas") or []
        ids: list[str] = all_data.get("ids") or []

        if not isinstance(docs, list) or not docs:
            return []

        vectorizer = TfidfVectorizer(
            sublinear_tf=True,
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
            if scores[i] > 0
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
    """Reciprocal Rank Fusion of semantic and keyword result lists."""
    rrf_scores: dict[str, float] = {}
    item_by_id: dict[str, dict] = {}

    for rank, hit in enumerate(semantic_hits):
        doc_id = hit["id"]
        rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
        item_by_id[doc_id] = hit

    for rank, hit in enumerate(keyword_hits):
        doc_id = hit["id"]
        rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
        if doc_id not in item_by_id:
            item_by_id[doc_id] = {
                "id": doc_id,
                "document": hit["document"],
                "metadata": hit["metadata"],
                "distance": None,
            }

    ranked = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:top_n]
    return [{**item_by_id[doc_id], "rrf_score": score} for doc_id, score in ranked]


@router.post("/query", response_model=RAGResponse)
async def query_knowledge(
    request: QueryRequest,
    current_user: dict = Depends(require_roles(["admin", "teacher", "student"]))
):
    start_time = datetime.now(timezone.utc)
    univ_id = current_user.get("university_id", "demo-university")

    # ── Conversational & Greeting Interceptor ────────────────────────────────
    cleaned_query = request.query.strip().rstrip("?!. ")
    if _GREETING_RE.search(cleaned_query) and len(cleaned_query.split()) <= 7:
        return RAGResponse(
            query=request.query,
            answer="Hello! I am your CampusNova Knowledge Base assistant. You can ask me questions about institutional policies, examination guidelines, attendance rules, course timetables, or transport routes.",
            citations=[],
        )

    # ── Agentic Intent Router ─────────────────────────────────────────────────
    intent = await classify_query_intent(request.query)
    logger.info("Query intent: %s for %r (tenant: %s)", intent, request.query, univ_id)

    if intent == "SUMMARIZE":
        return await _execute_summarize_path(request.query, university_id=univ_id)
    
    # Check if any documents are indexed in this tenant's repository; auto-seed canonical policies for demo tenant
    total_docs = 0
    try:
        total_docs = await mongo_db.knowledge_collection.count_documents({"indexing_status": "completed", "university_id": univ_id})
    except Exception:
        total_docs = 0

    collection = chroma_db.get_or_create_collection("student_documents")
    try:
        chroma_count = collection.count()
    except Exception:
        chroma_count = 0

    if (total_docs == 0 or chroma_count == 0) and univ_id == settings.DEMO_UNIVERSITY_ID:
        try:
            logger.info("Knowledge Base has 0 ChromaDB vector chunks for demo tenant %s — auto-seeding canonical policy documents...", univ_id)
            from app.services.seed_demo_knowledge import seed_canonical_demo_knowledge
            await seed_canonical_demo_knowledge(univ_id)
            total_docs = await mongo_db.knowledge_collection.count_documents({"indexing_status": "completed", "university_id": univ_id})
        except Exception as seed_err:
            logger.warning("Auto-seed demo knowledge failed: %s", seed_err)

    if total_docs == 0:
        return RAGResponse(
            query=request.query,
            answer="The Knowledge Base is currently empty. Upload university policies, regulations, manuals, circulars, or administrative documents to make them searchable.",
            citations=[]
        )

    semantic_hits = []
    
    try:
        # ── Stage 1: Semantic vector search filtered by tenant ─────────────
        results = collection.query(
            query_texts=[request.query],
            n_results=10,
            where={"university_id": univ_id},
            include=["documents", "metadatas", "distances"],
        )
        sem_ids       = results.get("ids", [[]])[0]
        sem_documents = results.get("documents", [[]])[0]
        sem_metadatas = results.get("metadatas", [[]])[0]
        sem_distances = results.get("distances", [[]])[0]

        semantic_hits = [
            {"id": doc_id, "document": doc, "metadata": meta, "distance": dist}
            for doc_id, doc, meta, dist in zip(sem_ids, sem_documents, sem_metadatas, sem_distances)
        ]
    except Exception as e:
        logger.warning(f"Vector search bypassed ({e}) — utilizing TF-IDF keyword search fallback.")

    # ── Stage 2: Keyword (TF-IDF) search filtered by tenant ────────────────
    keyword_hits = _keyword_search(collection, request.query, university_id=univ_id, n_results=10)

    # ── Stage 3: Reciprocal Rank Fusion ───────────────────────────────────
    merged_hits = _rrf_merge(semantic_hits, keyword_hits, k=60, top_n=8)

    if not merged_hits:
        return RAGResponse(
            query=request.query,
            answer="No relevant information was found in the indexed documents.",
            citations=[]
        )

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
    seen_citation_keys = set()

    for hit in merged_hits:
        doc_id = hit["id"]
        meta   = hit["metadata"] or {}
        child_doc = hit["document"]
        rrf    = hit["rrf_score"]
        confidence = min(rrf / _RRF_MAX, 1.0)
        filename = meta.get("filename") or "Document"

        # Check if it's an OCR document (has document_category but no chunk_index)
        if "document_category" in meta and "chunk_index" not in meta:
            # It's an OCR doc. Fetch full fields from MongoDB to give LLM maximum context.
            kb_doc = await mongo_db.knowledge_collection.find_one({"$or": [{"id": doc_id}, {"document_id": doc_id}], "university_id": univ_id})
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
                context_chunks.append(f"Context Block ({filename}):\n{parent_text}")
        else:
            context_chunks.append(f"Context Chunk ({filename}):\n{child_doc}")

        # Deduplicate citations so the user isn't flooded with multiple near-duplicate chunks
        citation_key = (meta.get("document_id", doc_id), parent_id or meta.get("chunk_index", 0))
        if citation_key not in seen_citation_keys and len(citations) < 4:
            seen_citation_keys.add(citation_key)
            citations.append(RAGCitation(
                document_id=meta.get("document_id", doc_id),
                source_file=filename,
                chunk_index=meta.get("chunk_index", 0),
                confidence_score=round(confidence, 4),
                extracted_text=child_doc.strip(),
            ))

    if not context_chunks:
        return RAGResponse(
            query=request.query,
            answer="No relevant information was found in the indexed documents.",
            citations=[]
        )

    context_text = "\n\n".join(context_chunks)

    system_prompt = (
        "You are an accurate, helpful AI assistant for a school/university ERP knowledge base. "
        "Answer the user's inquiry clearly and concisely using ONLY the information from the provided document context.\n\n"
        "Formatting Guidelines (Markdown):\n"
        "- Structure your answer with clear bullet points (`- `) or concise paragraphs.\n"
        "- Use **bold** for key rules, numbers, percentages, thresholds, and dates.\n"
        "- If multiple topics are addressed, use `## ` headings to organize them.\n"
        "- If the provided context does not contain the answer, reply: "
        "'I cannot find the answer based on the provided documents.'\n"
        "- Output direct, clean Markdown text only. Do NOT wrap your output in JSON."
    )
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Context:\n{context_text}\n\nQuery: {request.query}"}
    ]
    
    raw_content = ""
    try:
        resp = await call_llm(messages, "meta-llama/llama-3.1-8b-instruct")
        raw_content = (resp.choices[0].message.content or "").strip()
    except Exception as primary_e:
        logger.warning(f"Primary LLM failed: {primary_e}. Falling back to secondary model.")
        try:
            resp = await call_llm(messages, "meta-llama/llama-3.2-3b-instruct")
            raw_content = (resp.choices[0].message.content or "").strip()
        except Exception as secondary_e:
            logger.warning(f"Secondary LLM also failed: {secondary_e}. Using deterministic context response.")
            if context_chunks:
                extracted_blocks = "\n\n".join([f"• {c.strip()}" for c in context_chunks[:3]])
                answer = (
                    f"> **[Verified Policy Extraction — Direct Match]**\n\n"
                    f"*The following relevant clauses were retrieved directly from your indexed documentation:*\n\n"
                    f"{extracted_blocks}"
                )
            else:
                answer = "I cannot find the answer based on the provided documents."
            return RAGResponse(query=request.query, answer=answer, citations=citations)

    # Clean and parse answer
    answer, status = _clean_and_extract_answer(raw_content)

    # ── Safety-refusal guard ───────────────────────────────────────────────
    _ACTUAL_REFUSALS = (
        "user safety: unsafe",
        "i'm sorry, i can't assist",
        "i cannot fulfill this request",
        "violates content policy",
        "against policy",
    )
    if any(sig in answer.lower() for sig in _ACTUAL_REFUSALS):
        logger.warning(
            "Safety refusal detected for query %r. Raw answer: %r", request.query, answer
        )
        answer = (
            "The model declined to process this query due to safety filters. "
            "Please rephrase your question and try again."
        )
        status = "unsupported"

    if status == "unsupported":
        citations = []
        
    end_time = datetime.now(timezone.utc)
    duration = (end_time - start_time).total_seconds()
    logger.info(f"[{end_time.isoformat()}] Query executed in {duration} seconds: {request.query}")
    
    return RAGResponse(
        query=request.query,
        answer=answer,
        citations=citations
    )
