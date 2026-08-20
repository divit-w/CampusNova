from fastapi import APIRouter, Depends, HTTPException
from app.schemas.resources import ResourceConflictRequest
from app.api.v1.deps import require_roles
from app.services.mongo_service import mongo_db
from app.api.v1.alerts import alert_manager

router = APIRouter()

async def simulate_rag_policy_check():
    # Simulate autonomous RAG Policy check as per instructions
    return "Policy check passed: Substitute assignment authorized."

@router.post("/resolve-conflict")
async def resolve_conflict(
    request: ResourceConflictRequest,
    current_user: dict = Depends(require_roles(["admin"]))
):
    await simulate_rag_policy_check()
    
    # Check if absent teacher exists
    absent_teacher = await mongo_db.teachers_collection.find_one({"id": request.absent_teacher_id})
    if not absent_teacher:
        raise HTTPException(status_code=404, detail="Absent teacher not found")

    # Find substitute: any teacher not absent, and not already booked in this slot
    # We check substitutions_collection for conflicting bookings
    conflicts = await mongo_db.substitutions_collection.find({
        "date": request.date,
        "time_slot": request.time_slot
    }).to_list(length=1000)
    
    busy_teacher_ids = [c["substitute_teacher_id"] for c in conflicts]
    busy_teacher_ids.append(request.absent_teacher_id)
    
    substitute = await mongo_db.teachers_collection.find_one({
        "id": {"$nin": busy_teacher_ids}
    })
    
    if not substitute:
        raise HTTPException(status_code=409, detail="No available substitutes found for this time slot")
        
    substitution_record = {
        "absent_teacher_id": request.absent_teacher_id,
        "substitute_teacher_id": substitute["id"],
        "date": request.date,
        "time_slot": request.time_slot
    }
    
    await mongo_db.substitutions_collection.insert_one(substitution_record)
    
    alert_message = {
        "type": "alert",
        "message": f"Substitute {substitute['name']} assigned for {absent_teacher['name']} at {request.time_slot}."
    }
    await alert_manager.broadcast(alert_message)
    
    return {
        "status": "success",
        "substitute_teacher_id": substitute["id"],
        "message": alert_message["message"]
    }
