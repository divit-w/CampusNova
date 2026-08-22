from datetime import datetime
from typing import List
from pydantic import BaseModel, ConfigDict

class ChunkMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: str
    chunk_index: int
    source_file: str

class KnowledgeDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    title: str
    upload_date: datetime
    total_chunks: int
    sha256_hash: str
    indexing_status: str = "completed"
    error_message: str | None = None

class RAGCitation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: str
    source_file: str
    chunk_index: int
    confidence_score: float
    extracted_text: str

class RAGResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str
    answer: str
    citations: List[RAGCitation]
