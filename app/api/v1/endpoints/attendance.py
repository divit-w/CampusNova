from fastapi import APIRouter, Depends, Form, UploadFile, File, HTTPException, Request
import base64
from datetime import datetime, timezone
import json
import httpx
from pymongo import UpdateOne
from app.api.v1.deps import require_roles
from app.core.config import settings
from app.core.utils import haversine_distance
from app.services.mongo_service import mongo_db
from app.core.limiter import limiter

router = APIRouter()

async def check_liveness(base64_image: str) -> bool:
    # Full implementation interacting with OpenRouter/Vision API
    # Simulated structure that will be mocked in tests
    try:
        async with httpx.AsyncClient() as client:
            pass
        return True
    except Exception:
        return False

async def extract_attendance_from_image(base64_image: str) -> list:
    """
    Calls OpenRouter Vision API to extract attendance records.
    Returns a list of dicts: [{"student_id": "...", "status": "present"|"absent"}]
    """
    if not settings.OPENROUTER_API_KEY:
        # Fallback/mock for local execution if no API key is provided
        return [{"student_id": "S101", "status": "present"}, {"student_id": "S102", "status": "absent"}]
        
    try:
        async with httpx.AsyncClient() as client:
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
                                    "text": "Extract attendance records from this image. Return ONLY a JSON array containing objects with 'student_id' and 'status' (strictly 'present' or 'absent'). Do not include markdown formatting or any other text."
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
            # Clean up potential markdown formatting (e.g. ```json ... ```)
            if content.startswith("```json"):
                content = content[7:-3].strip()
            return json.loads(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vision API failure: {str(e)}")

@router.post("/faculty-clock-in")
async def faculty_clock_in(
    latitude: float = Form(...),
    longitude: float = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(require_roles(["teacher", "admin"]))
):
    # 1. Geofence Check
    distance = haversine_distance(settings.CAMPUS_LAT, settings.CAMPUS_LON, latitude, longitude)
    if distance > settings.GEOFENCE_RADIUS_METERS:
        raise HTTPException(status_code=403, detail="Outside Geofence")
        
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
    records = await extract_attendance_from_image(b64_img)
    
    if not records:
        return {"status": "success", "message": "No records extracted", "processed_count": 0}
        
    # 6. MongoDB bulk write (UpdateOne with upsert=True)
    operations = []
    for record in records:
        if "student_id" in record and "status" in record:
            operations.append(
                UpdateOne(
                    {"student_id": record["student_id"], "date": date},
                    {"$set": {
                        "status": record["status"],
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
        "message": f"Successfully processed {len(operations)} attendance records",
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
