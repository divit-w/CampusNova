import logging
from datetime import datetime, timedelta
import base64
import json
import uuid
import re
import asyncio
from openai import AsyncOpenAI, APITimeoutError, RateLimitError, APIError, APIConnectionError
import os
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from app.api.v1.deps import require_roles
from app.core.config import settings
from app.schemas.documents import UniversalDocumentSchema
from app.services.document_service import document_service
from app.services.mongo_service import mongo_db
from app.services.ocr_service import ocr_service

logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize client with OpenRouter's base URL
client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.OPENROUTER_API_KEY,
)

@router.post("/extract")
async def _process_single_document(file: UploadFile) -> dict:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail=f"Uploaded file {file.filename} must be an image.")

    image_bytes = await file.read()
    
    if len(image_bytes) < 5120:
        raise HTTPException(status_code=400, detail=f"Invalid format or blank image detected for {file.filename}.")
        
    redacted_bytes = ocr_service.redact_pii_from_image(image_bytes)
    base64_image = base64.b64encode(redacted_bytes).decode('utf-8')
    mime_type = file.content_type or "image/png"

    max_retries = 2
    for attempt in range(max_retries):
        try:
            response = await client.chat.completions.create(
                model="google/gemma-4-26b-a4b-it:free",
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "UniversalDocument",
                        "schema": UniversalDocumentSchema.model_json_schema(),
                        "strict": False
                    }
                },
                timeout=60.0,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": (
                                    "You are an expert enterprise and school administrative OCR parser. "
                                    "Treat all documents as generic enterprise/school records. "
                                    "Extract all relevant key-value details into the `extracted_fields` list array, "
                                    "provide a short objective summary, and accurately determine the document category "
                                    "(whether it is a financial report, handwritten note, signature sheet, application, or scan). "
                                    "CRITICAL: If the document contains phrases like 'Application for Leave', 'Leave Application', "
                                    "or mentions student absence (even if handwritten), you MUST set document_category='Leave Application' "
                                    "and extract student_name, student_id (if found), leave_start_date, leave_end_date, and leave_type. "
                                    "Every other generic attribute must have a separate key-value entry in `extracted_fields`. "
                                    "FORMATTING RULES:\n"
                                    "1. Date Normalization: Carefully find the leave dates (e.g. 18/08/2026). `leave_start_date` and `leave_end_date` MUST be extracted and normalized to the exact ISO format YYYY-MM-DD (e.g., 2026-08-18).\n"
                                    "2. Exact Student ID: `student_id` MUST be extracted exactly as written on the document, including prefixes like 'STU-' (e.g., STU-001). Do not strip prefixes and do not extract arbitrary numbers like '001'.\n"
                                    "3. Complete Name: `student_name` MUST include both the first and last name if they appear anywhere in the document.\n"
                                    "Do not return only a summary paragraph. Return ONLY a flat JSON object matching the schema exactly.\n\n"
                                    "Extract all key data points from this school document."
                                )
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{base64_image}"
                                }
                            }
                        ]
                    }
                ]
            )
            
            raw_content = response.choices[0].message.content
            if not raw_content or not raw_content.strip():
                logger.error(f"Empty AI response for {file.filename}")
                raise HTTPException(
                    status_code=502, 
                    detail={"message": "Document could not be processed. Please upload a clearer or supported document.", "code": "E011", "decision": "EXCEPTION", "severity": "CRITICAL"}
                )
                
            # Robust JSON extraction
            cleaned_content = raw_content.strip()
            # Try to extract from markdown blocks if present
            json_match = re.search(r'```(?:json)?(.*?)```', cleaned_content, re.DOTALL)
            if json_match:
                cleaned_content = json_match.group(1).strip()
            
            try:
                extracted_data = json.loads(cleaned_content)
            except json.JSONDecodeError as e:
                start = cleaned_content.find('{')
                end = cleaned_content.rfind('}')
                if start != -1 and end != -1 and end > start:
                    try:
                        extracted_data = json.loads(cleaned_content[start:end+1])
                    except Exception:
                        logger.error(f"Failed to parse JSON from AI response: {cleaned_content}. Error: {str(e)}")
                        raise ValueError("Invalid JSON")
                else:
                    logger.error(f"Failed to parse JSON from AI response: {cleaned_content}. Error: {str(e)}")
                    raise ValueError("Invalid JSON")
            
            if "application_details" in extracted_data:
                extracted_data = extracted_data["application_details"]
                
            parsed_doc = UniversalDocumentSchema(**extracted_data)
            break
            
        except HTTPException:
            if attempt == max_retries - 1:
                raise
            await asyncio.sleep(1)
        except APITimeoutError:
            if attempt == max_retries - 1:
                logger.error("AI provider timed out.")
                raise HTTPException(
                    status_code=504, 
                    detail={"message": "The AI provider timed out. Please try again.", "code": "E011", "decision": "EXCEPTION", "severity": "CRITICAL"}
                )
            await asyncio.sleep(1)
        except APIConnectionError as e:
            if attempt == max_retries - 1:
                logger.error(f"AI provider connection error: {str(e)}")
                raise HTTPException(
                    status_code=502,
                    detail={"message": "Unable to connect to AI provider. Please verify network connectivity.", "code": "E012", "decision": "EXCEPTION", "severity": "CRITICAL"}
                )
            await asyncio.sleep(1)
        except RateLimitError:
            if attempt == max_retries - 1:
                logger.error("AI provider rate limit exceeded.")
                raise HTTPException(status_code=429, detail="AI provider rate limit exceeded.")
            await asyncio.sleep(1)
        except (json.JSONDecodeError, ValueError) as e:
            if attempt == max_retries - 1:
                logger.error(f"Invalid or malformed response: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=502, 
                    detail={"message": "Document could not be processed. Please upload a clearer or supported document.", "code": "E011", "decision": "EXCEPTION", "severity": "CRITICAL"}
                )
            await asyncio.sleep(1)
        except Exception as e:
            if attempt == max_retries - 1:
                logger.error(f"Processing failed: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=500, 
                    detail={"message": "Document could not be processed. Please upload a clearer or supported document.", "code": "E011", "decision": "EXCEPTION", "severity": "CRITICAL"}
                )
            await asyncio.sleep(1)
            
    try:
        sanitized_fields = []
        for field in parsed_doc.extracted_fields:
            if not field.key:
                continue
            if len(field.key) > 40:
                continue
            if re.search(r'[_#]', field.key) and len(field.key) > 20:
                continue
            if re.search(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}', field.key):
                continue
                
            field.key = field.key.replace("**", "").replace("`", "").strip()
            sanitized_fields.append(field)
        parsed_doc.extracted_fields = sanitized_fields
            
        cat_lower = (parsed_doc.document_category or "").lower()
        
        # 1. Fix Leave Application Categorization Fallback
        if "leave" not in cat_lower and "application" not in cat_lower:
            combined_text = str(parsed_doc.summary).lower() + " " + " ".join([f"{f.key} {f.value}" for f in parsed_doc.extracted_fields]).lower()
            if "leave" in combined_text or "application for leave" in combined_text or "absent" in combined_text:
                parsed_doc.document_category = "Leave Application"
                cat_lower = "leave application"
        if "fee" in cat_lower or "financial" in cat_lower or "invoice" in cat_lower or "receipt" in cat_lower:
            parsed_doc.target_department = "Accounts Department"
        elif "medical" in cat_lower or "illness" in cat_lower or "doctor" in cat_lower or "prescription" in cat_lower:
            parsed_doc.target_department = "School Infirmary / Nurse"
        elif "leave" in cat_lower or "application" in cat_lower:
            parsed_doc.target_department = "Class Coordinator / Administration"
        else:
            parsed_doc.target_department = "General Administration"
            
        student_name = None
        for field in parsed_doc.extracted_fields:
            k = field.key.lower()
            if "student name" in k or "applicant_name" in k or "roll number" in k or "name" == k:
                student_name = field.value
                break
                
        if student_name:
            matched_student = await mongo_db.students_collection.find_one({"full_name": {"$regex": f"^{re.escape(student_name)}$", "$options": "i"}})
            if matched_student:
                parsed_doc.student_verified = True
                parsed_doc.matched_student_class = matched_student.get("grade", "Unknown Class")
            else:
                parsed_doc.student_verified = False

        # Validation & Decision Engines
        from app.services.validation_engine import LeaveApplicationValidator
        from app.services.decision_engine import route_document
        
        is_student_doc = any(kw in cat_lower for kw in ["student", "leave", "application", "admission"])
        
        if is_student_doc:
            validator = LeaveApplicationValidator(parsed_doc)
            validations = await validator.validate()
            parsed_doc.validations = validations
            
            decision, decision_reason = route_document(parsed_doc, validations)
            parsed_doc.decision = decision
            parsed_doc.decision_reason = decision_reason
            
            if decision == "EXCEPTION":
                parsed_doc.status = "exception"
                parsed_doc.requires_human_review = True
            elif decision == "REVIEW":
                parsed_doc.status = "pending_manual_review"
                parsed_doc.requires_human_review = True
            elif decision == "AUTO":
                parsed_doc.status = "approved_auto"
                parsed_doc.requires_human_review = False
                
            policy_alerts = [v["message"] for k, v in validations.items() if not v.get("passed") and v.get("severity") == "POLICY_FLAG"]
            if policy_alerts:
                parsed_doc.policy_alert = " | ".join(policy_alerts)
        else:
            parsed_doc.validations = {}
            parsed_doc.decision = "REVIEW"
            parsed_doc.decision_reason = "Manual review required for non-student generic documents."
            parsed_doc.status = "pending_manual_review"
            parsed_doc.requires_human_review = True

    except Exception as e:
        logger.error(f"Unexpected pipeline failure: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"message": "Document could not be processed. Please upload a clearer or supported document.", "code": "E011", "decision": "EXCEPTION", "severity": "CRITICAL"}
        )
    
    document_id = str(uuid.uuid4())
    await document_service.index_document(parsed_doc, document_id)
    
    # 1. Doc Library Visibility: Save document metadata to knowledge_collection
    kb_payload = {
        "id": document_id,
        "document_id": document_id,
        "title": file.filename,
        "upload_date": datetime.utcnow().isoformat(),
        "total_chunks": 1,
        "sha256_hash": f"ocr-{document_id}",
        "file_hash": f"ocr-{document_id}",
        "indexing_status": "completed",
        "document_category": parsed_doc.document_category,
        "summary": parsed_doc.summary,
        "target_department": parsed_doc.target_department,
        "extracted_fields": [f.model_dump() for f in parsed_doc.extracted_fields],
        "validations": parsed_doc.validations,
        "decision": parsed_doc.decision,
        "decision_reason": parsed_doc.decision_reason,
        "status": parsed_doc.status or "extracted",
        "updated_at": datetime.utcnow().isoformat()
    }
    await mongo_db.knowledge_collection.update_one(
        {"id": document_id},
        {"$set": kb_payload},
        upsert=True
    )
    
    response_dict = parsed_doc.model_dump()
    response_dict["document_id"] = document_id
    response_dict["filename"] = file.filename
    return response_dict

@router.post("/extract")
async def extract_document(file: UploadFile = File(...)):
    return await _process_single_document(file)

from typing import List

@router.post("/batch-extract")
async def batch_extract_documents(files: List[UploadFile] = File(...)):
    # Bounded concurrency to avoid rate limits
    sem = asyncio.Semaphore(4)
    
    async def process_with_sem(f: UploadFile):
        async with sem:
            try:
                res = await _process_single_document(f)
                return {"filename": f.filename, "status": "success", "data": res}
            except HTTPException as e:
                return {"filename": f.filename, "status": "error", "error": e.detail}
            except Exception as e:
                return {"filename": f.filename, "status": "error", "error": str(e)}

    results = await asyncio.gather(*(process_with_sem(f) for f in files))
    return {"results": results}

from typing import Optional

@router.post("/{document_id}/approve")
async def approve_document(
    document_id: str, 
    doc_data: Optional[UniversalDocumentSchema] = None,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """
    Final confirmation API call to seal the document in the operational registry.
    Updates the document status from 'pending_manual_review' to 'approved'.
    """
    success = await document_service.approve_document(document_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to approve document in the operational registry.")
        
    # Fetch the 1536-dimensional embedding from ChromaDB
    embedding = None
    try:
        from app.services.chroma_service import chroma_db
        collection = chroma_db.get_or_create_collection("student_documents")
        existing_doc = collection.get(ids=[document_id], include=["embeddings"])
        if existing_doc and existing_doc["embeddings"] and len(existing_doc["embeddings"]) > 0:
            embedding = existing_doc["embeddings"][0]
    except Exception:
        pass

    if doc_data and doc_data.document_category:
        category_lower = doc_data.document_category.lower()
        is_student_doc = any(kw in category_lower for kw in ["student", "leave", "application", "admission"])
        
        if "leave" in category_lower:
            student_name = doc_data.student_name
            student_id = doc_data.student_id
            leave_date = doc_data.leave_start_date or doc_data.leave_end_date
            
            # Fallback to extracted_fields if top-level fields are missing
            for field in doc_data.extracted_fields:
                k = field.key.lower()
                if not student_name and ("name" in k or "applicant" in k or "roll" in k):
                    student_name = field.value
                elif not leave_date and ("date" in k or "from" in k or "to" in k):
                    leave_date = field.value
                    
            if student_name:
                # 2. Attendance Page Visibility (Backend Field Normalization)
                if not student_id:
                    matched = await mongo_db.students_collection.find_one({"full_name": {"$regex": f"^{re.escape(str(student_name))}$", "$options": "i"}})
                    student_id = matched.get("student_id") if matched else str(student_name)
                
                start_date_str = doc_data.leave_start_date or leave_date or datetime.utcnow().strftime("%Y-%m-%d")
                end_date_str = doc_data.leave_end_date or start_date_str
                
                try:
                    start_dt = datetime.strptime(start_date_str, "%Y-%m-%d")
                    end_dt = datetime.strptime(end_date_str, "%Y-%m-%d")
                except ValueError:
                    start_dt = datetime.strptime(datetime.utcnow().strftime("%Y-%m-%d"), "%Y-%m-%d")
                    end_dt = start_dt

                if end_dt < start_dt:
                    end_dt = start_dt

                from pymongo import UpdateOne
                
                current_dt = start_dt
                operations = []
                while current_dt <= end_dt:
                    operations.append(
                        UpdateOne(
                            {
                                "student_id": student_id,
                                "date": current_dt.strftime("%Y-%m-%d")
                            },
                            {
                                "$set": {
                                    "status": "excused",
                                    "source_document_id": document_id,
                                    "updated_at": datetime.utcnow().isoformat()
                                }
                            },
                            upsert=True
                        )
                    )
                    current_dt += timedelta(days=1)
                
                if operations:
                    await mongo_db.student_attendance_collection.bulk_write(operations)

                return {"status": "success", "message": "Document verified, reviewed, and finalized in the operational registry. Attendance register automatically updated."}

        if not is_student_doc:
            # Priority 5: Robust "Knowledge Base" Database Persistence for Operational/Non-School Documents
            kb_payload = {
                "document_id": document_id,
                "document_category": doc_data.document_category,
                "summary": doc_data.summary,
                "target_department": doc_data.target_department,
                "extracted_fields": [f.model_dump() for f in doc_data.extracted_fields],
                "status": "indexed_to_knowledge_base",
                "updated_at": datetime.utcnow().isoformat()
            }
            if embedding:
                kb_payload["embedding"] = embedding
                
            await mongo_db.knowledge_collection.update_one(
                {"document_id": document_id},
                {"$set": kb_payload},
                upsert=True
            )
            return {"status": "success", "message": "Document structured payload and 1536-dim vector embedding successfully persisted to the Knowledge Base."}

    return {"status": "success", "message": "Document verified, reviewed, and finalized in the operational registry."}