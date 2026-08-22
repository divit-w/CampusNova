import asyncio
import uuid
import fitz
from datetime import datetime, timezone
from openai import AsyncOpenAI

from app.core.config import settings
from app.services.mongo_service import mongo_db
from app.services.chroma_service import chroma_db
from app.schemas.knowledge import KnowledgeDocument

client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.OPENROUTER_API_KEY,
)

class IngestionService:
    def extract_text(self, file_bytes: bytes) -> str:
        """Parse PDF bytes with PyMuPDF and extract all page text.

        Raises:
            ValueError: if fitz considers the bytes structurally invalid.
        """
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
        except Exception as exc:
            raise ValueError(f"PyMuPDF could not open the PDF stream: {exc}") from exc

        text = ""
        for page in doc:
            text += page.get_text()
        return text

    def hierarchical_chunk_text(self, text: str, parent_size: int = 2000, parent_overlap: int = 200, child_size: int = 400, child_overlap: int = 50) -> list[dict]:
        """Split text hierarchically into large parent chunks and smaller child chunks.
        
        Returns a list of dicts containing the child text, its parent text, and routing IDs.
        Embedding the child text provides precision, while returning the parent text to the
        LLM provides full semantic context.
        """
        chunks_data = []
        p_start = 0
        text_length = len(text)
        chunk_index = 0
        p_idx = 0
        
        if text_length == 0:
            return chunks_data
            
        while p_start < text_length:
            p_end = p_start + parent_size
            parent_text = text[p_start:p_end]
            
            c_start = 0
            p_length = len(parent_text)
            
            while c_start < p_length:
                c_end = c_start + child_size
                child_text = parent_text[c_start:c_end]
                
                chunks_data.append({
                    "child_text": child_text,
                    "parent_text": parent_text,
                    "parent_id": f"p{p_idx}",
                    "chunk_index": chunk_index
                })
                chunk_index += 1
                
                if c_end >= p_length:
                    break
                c_start += (child_size - child_overlap)
                
            if p_end >= text_length:
                break
            p_start += (parent_size - parent_overlap)
            p_idx += 1
            
        return chunks_data

    async def process_and_store_pdf(self, file_bytes: bytes, filename: str, file_hash: str, document_id: str):
        try:
            text = self.extract_text(file_bytes)
            chunks = self.hierarchical_chunk_text(text)
            
            if not chunks:
                await mongo_db.knowledge_collection.update_one(
                    {"id": document_id},
                    {"$set": {"indexing_status": "completed", "total_chunks": 0}}
                )
                return {"document_id": document_id, "total_chunks": 0}
            
            # Use ChromaDB's default local embeddings instead of paid OpenRouter embeddings
            embeddings = None
            collection = chroma_db.get_or_create_collection("student_documents")
            
            ids = [f"{document_id}_{d['chunk_index']}" for d in chunks]
            metadatas = [
                {
                    "document_id": document_id, 
                    "chunk_index": d["chunk_index"], 
                    "filename": filename,
                    "parent_id": f"{document_id}_{d['parent_id']}",
                    "parent_text": d["parent_text"]
                } 
                for d in chunks
            ]
            
            child_documents = [d["child_text"] for d in chunks]
            
            if embeddings:
                collection.add(
                    ids=ids,
                    embeddings=embeddings,
                    documents=child_documents,
                    metadatas=metadatas
                )
            else:
                collection.add(
                    ids=ids,
                    documents=child_documents,
                    metadatas=metadatas
                )
            
            await mongo_db.knowledge_collection.update_one(
                {"id": document_id},
                {"$set": {"indexing_status": "completed", "total_chunks": len(chunks)}}
            )
            return {"document_id": document_id, "total_chunks": len(chunks)}
            
        except ValueError as exc:
            # PyMuPDF structural failures
            await mongo_db.knowledge_collection.update_one(
                {"id": document_id},
                {"$set": {"indexing_status": "failed", "error_message": f"Invalid or unparsable PDF file format: {exc}"}}
            )
            raise
        except Exception as exc:
            # Embedding, ChromaDB, or Mongo failures
            await mongo_db.knowledge_collection.update_one(
                {"id": document_id},
                {"$set": {"indexing_status": "failed", "error_message": str(exc)}}
            )
            raise

ingestion_service = IngestionService()
