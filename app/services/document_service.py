import logging
from openai import AsyncOpenAI
from app.services.chroma_service import chroma_db
from app.schemas.documents import UniversalDocumentSchema
from app.core.config import settings

logger = logging.getLogger(__name__)

# Initialize client to generate embeddings matching the RAG collection dimension (1536)
openai_client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.OPENROUTER_API_KEY,
)

class DocumentService:
    async def index_document(self, doc: UniversalDocumentSchema, document_id: str):
        try:
            collection = chroma_db.get_or_create_collection("student_documents")
            
            # Build searchable text from summary and all extracted dynamic fields
            fields_text = ", ".join([f"{f.key}: {f.value}" for f in doc.extracted_fields])
            searchable_text = f"Category: {doc.document_category}. Summary: {doc.summary}. Details: {fields_text}"
            
            # Generate correct 1536-dimensional embeddings matching settings.EMBEDDING_MODEL
            embed_resp = await openai_client.embeddings.create(
                input=[searchable_text],
                model=settings.EMBEDDING_MODEL
            )
            embedding = embed_resp.data[0].embedding
            
            collection.add(
                ids=[document_id],
                documents=[searchable_text],
                embeddings=[embedding],
                metadatas=[{
                    "document_category": doc.document_category,
                    "summary": doc.summary,
                    "status": doc.status or "pending_manual_review"
                }]
            )
        except Exception as e:
            logger.error(f"Failed to index document in ChromaDB: {str(e)}")
            # Fail gracefully without crashing the server response

    async def approve_document(self, document_id: str, updated_data: dict = None):
        try:
            collection = chroma_db.get_or_create_collection("student_documents")
            # Fetch existing metadata
            existing = collection.get(ids=[document_id], include=["metadatas"])
            if existing and existing["metadatas"] and len(existing["metadatas"]) > 0:
                metadata = existing["metadatas"][0]
                metadata["status"] = "approved"
                collection.update(ids=[document_id], metadatas=[metadata])
            return True
        except Exception as e:
            logger.error(f"Failed to approve document in ChromaDB: {str(e)}")
            return False

document_service = DocumentService()
