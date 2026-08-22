import logging
from fastapi import APIRouter, Depends, Form, UploadFile, File, HTTPException, Request

logger = logging.getLogger(__name__)
import base64
from datetime import datetime, timezone
import json
import httpx
import math
from pymongo import UpdateOne
from app.api.v1.deps import require_roles
from app.core.config import settings
from app.core.utils import haversine_distance
from app.services.mongo_service import mongo_db
from app.core.limiter import limiter

TARGET_LAT = 28.6304
TARGET_LON = 77.3711
MAX_RADIUS_M = 500.0

def calculate_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0  # Earth radius in meters
    phi_1 = math.radians(lat1)
    phi_2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi_1) * math.cos(phi_2) * math.sin(delta_lambda / 2.0)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c

router = APIRouter()

async def check_liveness(base64_image: str) -> bool:
    """
    Strict verification. If the API fails, it explicitly raises the exact HTTP error.
    """
    if not settings.OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is missing from environment variables.")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "nvidia/nemotron-nano-12b-v2-vl:free",
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Does this image clearly show a human face? Answer only YES or NO.",
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/jpeg;base64,{base64_image}"
                                    },
                                },
                            ],
                        }
                    ],
                },
            )
            response.raise_for_status()
            answer = response.json()["choices"][0]["message"]["content"].strip().upper()
            return answer.startswith("YES")
            
    except httpx.HTTPStatusError as e:
        logger.error(f"OpenRouter API HTTP Error: {e.response.text}")
        if e.response.status_code == 429:
            raise HTTPException(status_code=429, detail="OpenRouter API Rate limit exceeded. Please try again in a few minutes.")
        raise HTTPException(status_code=502, detail=f"AI Provider Error {e.response.status_code}: {e.response.text}")
    except httpx.RequestError as e:
        logger.error(f"OpenRouter Network Error: {str(e)}")
        raise HTTPException(status_code=504, detail="AI Provider Timeout or Network Error.")

async def extract_attendance_from_image(base64_image: str) -> dict:
    """
    Calls OpenRouter Vision API to extract attendance records.
    Returns a dict: {"date": "YYYY-MM-DD", "records": [{"student_id": "...", "name": "...", "status": "present"|"absent"|"on_leave"}]}
    """
    if not settings.OPENROUTER_API_KEY:
        # Fallback/mock for local execution if no API key is provided
        return {"date": "2026-08-16", "records": [{"student_id": "s1", "name": "Alice Johnson", "status": "present"}, {"student_id": "s2", "name": "Bob Smith", "status": "absent"}]}
        
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:  # Step 7: explicit timeout
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "openrouter/free",
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Extract attendance records from this image. Parse any tabular grid containing Student/Staff Names, Roll Numbers, and P/A/Tick/Cross marks into standard JSON. Return ONLY a JSON object containing a 'date' (YYYY-MM-DD) and a 'records' array. Each record object must have 'student_id', 'name', and 'status' (strictly 'present', 'absent', or 'on_leave'). Do not include markdown formatting or any other text."
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/jpeg;base64,{base64_image}"
                                    }
                                }
                            ]
                        }
                    ]
                }
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"].strip()
            # Step 10: Robust markdown fence stripping — handles ```json, ```, ```JSON, etc.
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.lower().startswith("json"):
                    content = content[4:]
                content = content.strip()
            return json.loads(content)
    except Exception as e:
        # Step 6: Log internally; never expose raw exception details to callers
        logger.error(f"Vision API extract_attendance failure: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail="Vision API is temporarily unavailable")

@router.post("/faculty-clock-in")
@limiter.limit("10/minute")  # Step 11: rate limit to prevent brute-force coordinate spoofing
async def faculty_clock_in(
    request: Request,  # Required by slowapi for rate limiting
    latitude: float = Form(...),
    longitude: float = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(require_roles(["teacher", "admin"]))
):
    # 1. Geofence Check
    distance = calculate_distance_meters(latitude, longitude, TARGET_LAT, TARGET_LON)
    if distance > MAX_RADIUS_M:
        raise HTTPException(
            status_code=403, 
            detail=f"Outside geofence. Distance: {int(distance)}m"
        )
        
    # 2. Convert image to base64
    image_bytes = await file.read()
    b64_img = base64.b64encode(image_bytes).decode('utf-8')
    
    # 3. Vision API check
    is_live = await check_liveness(b64_img)
    
    # 4. Handle Vision failure
    if not is_live:
        raise HTTPException(status_code=400, detail="Invalid liveness check")
        
    # 5. Insert Attendance
    doc = {
        "teacher_id": current_user["id"],
        "coordinates": {"lat": latitude, "lon": longitude},
        "timestamp": datetime.now(timezone.utc)
    }
    
    await mongo_db.faculty_attendance_collection.insert_one(doc)
    
    return {"status": "success", "message": "Clock-in successful"}

@router.post("/process-sheet")
@limiter.limit("5/minute")
async def process_sheet(
    request: Request,
    file: UploadFile = File(...),
    date: str = Form(None),
    current_user: dict = Depends(require_roles(["teacher", "admin"]))
):
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
    # 1. Validate file extension
    valid_extensions = {".jpg", ".jpeg", ".png", ".pdf"}
    import os
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in valid_extensions:
        raise HTTPException(status_code=400, detail="Invalid file type")
        
    # 2. Convert to base64
    image_bytes = await file.read()
    b64_img = base64.b64encode(image_bytes).decode('utf-8')
    
    # 3 & 4 & 5. Call Vision API and parse JSON
    extracted_data = await extract_attendance_from_image(b64_img)
    records = extracted_data.get("records", [])
    extracted_date = extracted_data.get("date", date)
    
    if not records:
        return {"status": "success", "message": "No records extracted", "processed_count": 0, "records": [], "date": date}
        
    return {
        "status": "success",
        "message": f"Successfully extracted {len(records)} attendance records",
        "processed_count": len(records),
        "records": records,
        "date": extracted_date
    }

from app.schemas.attendance import BulkEdgeSyncRequest, SyncBulkRequest

@router.post("/sync-bulk")
async def sync_bulk(
    request: SyncBulkRequest,
    current_user: dict = Depends(require_roles(["teacher", "admin"]))
):
    operations = []
    for record in request.records:
        operations.append(
            UpdateOne(
                {"student_id": record.student_id, "date": request.date},
                {"$set": {
                    "status": record.status,
                    "teacher_id": current_user["id"],
                    "updated_at": datetime.now(timezone.utc)
                }},
                upsert=True
            )
        )
            
    if operations:
        await mongo_db.student_attendance_collection.bulk_write(operations)
        
    return {
        "status": "success",
        "message": f"Successfully synced {len(operations)} attendance records",
        "processed_count": len(operations)
    }

from app.schemas.attendance import BulkEdgeSyncRequest

@router.post("/edge-sync")
async def edge_sync(
    request: BulkEdgeSyncRequest,
    current_user: dict = Depends(require_roles(["admin", "system_node"]))
):
    operations = []
    synced_records = 0
    dropped_records = 0
    
    for record in request.records:
        if record.confidence_score >= 0.85:
            # We use Upsert to ensure idempotency. 
            # We'll use the date component of the timestamp as the unique key identifier for a given day.
            date_str = record.timestamp.strftime("%Y-%m-%d")
            operations.append(
                UpdateOne(
                    {"student_id": record.student_id, "date": date_str},
                    {"$set": {
                        "status": record.status,
                        "confidence_score": record.confidence_score,
                        "updated_at": datetime.now(timezone.utc),
                        "source": "edge_node"
                    }},
                    upsert=True
                )
            )
            synced_records += 1
        else:
            dropped_records += 1
            
    if operations:
        await mongo_db.student_attendance_collection.bulk_write(operations)
        
    return {
        "synced_records": synced_records,
        "dropped_records": dropped_records
    }

from app.schemas.attendance import (
    BulkAttendanceExtraction, 
    BulkAttendanceResponse,
    FinalizeBulkAttendanceRequest
)
from app.services.validation_engine import BulkAttendanceValidator
from app.services.decision_engine import route_bulk_attendance
import uuid

async def extract_bulk_attendance_from_image(base64_image: str) -> dict:
    if not settings.OPENROUTER_API_KEY:
        # Fallback/mock for local execution if no API key is provided
        return {
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "class_section": "Mock Class",
            "records": [
                {"student_id": "S101", "student_name": "Test Student 1", "status": "present"},
                {"student_id": "S102", "student_name": "Test Student 2", "status": "absent"}
            ]
        }
        
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "meta-llama/llama-3.2-11b-vision-instruct:free",
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Extract the attendance table from this image. Identify the attendance table, student IDs/roll numbers, names, and attendance status. Rules: ✓ = present, X / cross = absent, L = leave. Do not invent students. Do not reorder rows unnecessarily. Preserve extracted values. Return ONLY a JSON object with keys: 'date' (YYYY-MM-DD), 'class_section' (string), and 'records' (array of objects with 'student_id', 'student_name', and 'status'). Status MUST be exactly 'present', 'absent', or 'leave'. Do not include markdown formatting."
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/jpeg;base64,{base64_image}"
                                    }
                                }
                            ]
                        }
                    ]
                }
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"].strip()
            
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.lower().startswith("json"):
                    content = content[4:]
                content = content.strip()
            
            return json.loads(content)
    except Exception as e:
        logger.error(f"Vision API bulk extract failure: {e}", exc_info=True)
        raise HTTPException(
            status_code=502, 
            detail={"message": "Vision API is temporarily unavailable or failed to parse the document.", "code": "E011", "decision": "EXCEPTION", "severity": "CRITICAL"}
        )

@router.post("/process-bulk-register", response_model=BulkAttendanceResponse)
@limiter.limit("5/minute")
async def process_bulk_register(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_roles(["teacher", "admin"]))
):
    # 1. Validate file extension
    valid_extensions = {".jpg", ".jpeg", ".png", ".pdf"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in valid_extensions:
        raise HTTPException(
            status_code=400, 
            detail={"message": "Invalid file type. Only JPG, PNG, and PDF are supported.", "code": "E002", "decision": "EXCEPTION", "severity": "CRITICAL"}
        )
        
    # 2. Convert to base64
    try:
        image_bytes = await file.read()
        if len(image_bytes) < 5120:
             raise ValueError("File too small or empty.")
        b64_img = base64.b64encode(image_bytes).decode('utf-8')
    except Exception as e:
        raise HTTPException(
            status_code=400, 
            detail={"message": "Failed to read image file.", "code": "E003", "decision": "EXCEPTION", "severity": "CRITICAL"}
        )
    
    # 3. Vision API Extraction
    extracted_data = await extract_bulk_attendance_from_image(b64_img)
    
    # 4. Pydantic Schema Validation
    try:
        extraction = BulkAttendanceExtraction(**extracted_data)
    except Exception as e:
        logger.error(f"Bulk extraction schema validation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail={"message": "AI returned malformed or unexpected data.", "code": "E011", "decision": "EXCEPTION", "severity": "CRITICAL"}
        )

    # 5. Row-Level Validation
    try:
        validator = BulkAttendanceValidator()
        processed_rows = await validator.validate_batch(extraction)
    except Exception as e:
        logger.error(f"Bulk validation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail={"message": "System validation encountered an error.", "code": "E011", "decision": "EXCEPTION", "severity": "CRITICAL"}
        )

    # 6. Overall Batch Decision
    overall_decision, decision_reason = route_bulk_attendance(processed_rows)

    # 7. Prepare Response (No DB insertion here!)
    batch_id = str(uuid.uuid4())
    total_rows = len(processed_rows)
    valid_rows = sum(1 for r in processed_rows if r.decision == "VALID")
    review_rows = sum(1 for r in processed_rows if r.decision == "REVIEW")
    exception_rows = sum(1 for r in processed_rows if r.decision == "EXCEPTION")

    return BulkAttendanceResponse(
        batch_id=batch_id,
        date=extraction.date,
        class_section=extraction.class_section,
        total_rows=total_rows,
        valid_rows=valid_rows,
        review_rows=review_rows,
        exception_rows=exception_rows,
        records=processed_rows,
        overall_decision=overall_decision,
        decision_reason=decision_reason
    )

@router.post("/finalize-bulk")
async def finalize_bulk(
    request: FinalizeBulkAttendanceRequest,
    current_user: dict = Depends(require_roles(["teacher", "admin"]))
):
    operations = []
    
    for record in request.records:
        if record.decision == "EXCEPTION":
            continue
            
        operations.append(
            UpdateOne(
                {"student_id": record.student_id, "date": request.date},
                {"$set": {
                    "status": record.status,
                    "teacher_id": current_user["id"],
                    "updated_at": datetime.now(timezone.utc),
                    "source": "bulk_ocr_batch",
                    "batch_id": request.batch_id
                }},
                upsert=True
            )
        )
        
    if operations:
        try:
            await mongo_db.student_attendance_collection.bulk_write(operations)
        except Exception as e:
            logger.error(f"Failed bulk write during finalize: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Database write failed.")
            
    # Audit log
    audit_doc = {
        "batch_id": request.batch_id,
        "date": request.date,
        "class_section": request.class_section,
        "processed_at": datetime.now(timezone.utc),
        "approved_by": current_user["id"],
        "records_written": len(operations),
        "total_submitted": len(request.records)
    }
    await mongo_db.db.get_collection("bulk_attendance_audit").insert_one(audit_doc)

    return {
        "status": "success",
        "message": f"Successfully finalized {len(operations)} attendance records.",
        "batch_id": request.batch_id
    }
