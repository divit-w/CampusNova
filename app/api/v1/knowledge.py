import hashlib
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential

from app.services.ingestion_service import ingestion_service, client as openai_client
from app.services.mongo_service import mongo_db
from app.services.chroma_service import chroma_db
from app.schemas.knowledge import RAGResponse, RAGCitation

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15MB

class QueryRequest(BaseModel):
    query: str

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
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
    existing = await mongo_db.knowledge_collection.find_one({"file_hash": file_hash})
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

    try:
        result = await ingestion_service.process_and_store_pdf(file_bytes, file.filename, file_hash)
    except Exception as e:
        logger.error(f"Error parsing PDF: {e}")
        raise HTTPException(status_code=422, detail="Invalid or unparsable PDF file format")
        
    now = datetime.now(timezone.utc).isoformat()
    logger.info(f"[{now}] Successfully uploaded and ingested document {file.filename} with hash {file_hash}")
    
    return {"message": "Upload successful", "document_id": result["document_id"], "total_chunks": result["total_chunks"]}


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def call_llm(messages: list, model: str):
    response = await openai_client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.1,
        response_format={"type": "json_object"}
    )
    return response

@router.post("/query", response_model=RAGResponse)
async def query_knowledge(request: QueryRequest):
    start_time = datetime.now(timezone.utc)
    
    try:
        # Generate query embeddings
        embed_resp = await openai_client.embeddings.create(
            input=[request.query],
            model="nomic-ai/nomic-embed-text"
        )
        query_embedding = embed_resp.data[0].embedding
        
        # Search ChromaDB
        collection = chroma_db.get_or_create_collection("student_documents")
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=5
        )
    except Exception as e:
        logger.error(f"Database error during query: {e}")
        raise HTTPException(status_code=503, detail="Database service temporarily unavailable")
        
    distances = results["distances"][0] if results["distances"] else []
    documents = results["documents"][0] if results["documents"] else []
    metadatas = results["metadatas"][0] if results["metadatas"] else []
    
    context_chunks = []
    citations = []
    for doc, meta, dist in zip(documents, metadatas, distances):
        if dist < 0.4:  
            context_chunks.append(f"Chunk {meta['chunk_index']} (Doc: {meta['document_id']}): {doc}")
            citations.append(RAGCitation(
                document_id=meta["document_id"],
                chunk_index=meta["chunk_index"],
                confidence_score=float(1.0 - min(dist, 1.0)), 
                extracted_text=doc
            ))
            
    context_text = "\n\n".join(context_chunks)
    
    system_prompt = (
        "You are a strict RAG assistant. Answer the user's query using ONLY the provided context chunks. "
        "You MUST cite specific chunk indices from the context in your answer. "
        "Return your answer as a JSON object with two keys: 'status' (string) and 'answer' (string). "
        "If the chunks do not contain the answer, you MUST exactly return: "
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
            
    # Initialize content before the try block so the except path and the
    # status check below never access an unbound variable (UnboundLocalError fix).
    content: dict = {}
    try:
        content = json.loads(resp.choices[0].message.content)
        answer = content.get("answer", "")
    except Exception as e:
        logger.error(f"Failed to parse LLM JSON response: {e}. Raw content: {resp.choices[0].message.content!r}")
        answer = "The system encountered an error processing the response. Please try again."

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
