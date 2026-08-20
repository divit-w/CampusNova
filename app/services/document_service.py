from app.services.chroma_service import chroma_db
from app.schemas.documents import DocumentSchema

class DocumentService:
    def index_document(self, doc: DocumentSchema, document_id: str):
        collection = chroma_db.get_or_create_collection("student_documents")
        
        searchable_text = f"Student Name: {doc.student_name}, Admission: {doc.admission_number}, Grade: {doc.grade_level}"
        
        collection.add(
            ids=[document_id],
            documents=[searchable_text],
            metadatas=[{"student_name": doc.student_name, "admission_number": doc.admission_number}]
        )

document_service = DocumentService()
