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
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        return text

    def chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
        chunks = []
        start = 0
        text_length = len(text)
        
        if text_length == 0:
            return chunks
            
        while start < text_length:
            end = start + chunk_size
            chunks.append(text[start:end])
            if end >= text_length:
                break
            start += (chunk_size - overlap)
            
        return chunks

    async def process_and_store_pdf(self, file_bytes: bytes, filename: str, file_hash: str):
        text = self.extract_text(file_bytes)
        chunks = self.chunk_text(text)
        
        document_id = str(uuid.uuid4())
        
        if not chunks:
            return {"document_id": document_id, "total_chunks": 0}
        
        response = await client.embeddings.create(
            input=chunks,
            model="nomic-ai/nomic-embed-text"
        )
        
        embeddings = [data.embedding for data in response.data]
        
        collection = chroma_db.get_or_create_collection("student_documents")
        
        ids = [f"{document_id}_{i}" for i in range(len(chunks))]
        metadatas = [
            {
                "document_id": document_id, 
                "chunk_index": i, 
                "filename": filename
            } 
            for i in range(len(chunks))
        ]
        
        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas
        )
        
        record = KnowledgeDocument(
            id=document_id,
            title=filename,
            upload_date=datetime.now(timezone.utc),
            total_chunks=len(chunks),
            file_hash=file_hash
        )
        
        await mongo_db.knowledge_collection.insert_one(record.model_dump())
        
        return {"document_id": document_id, "total_chunks": len(chunks)}

ingestion_service = IngestionService()
