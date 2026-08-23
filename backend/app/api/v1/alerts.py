import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Optional
from fastapi import APIRouter, Request, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from app.services.mongo_service import mongo_db
from app.api.v1.deps import get_current_user_ws, require_roles

logger = logging.getLogger(__name__)
router = APIRouter()


class AlertManager:
    def __init__(self):
        # List of (queue, university_id)
        self.subscribers: List[Tuple[asyncio.Queue, str]] = []

    def register(self, queue: asyncio.Queue, university_id: str):
        self.subscribers.append((queue, university_id))

    def unregister(self, queue: asyncio.Queue):
        self.subscribers = [(q, u) for q, u in self.subscribers if q != queue]

    async def broadcast(self, message: dict):
        target_univ = message.get("university_id")
        for q, u in list(self.subscribers):
            # If alert is tagged for a tenant, deliver only to subscribers of that tenant
            if target_univ is None or target_univ == u:
                try:
                    await q.put(message)
                except Exception as e:
                    logger.warning(f"Failed to enqueue alert for tenant {u}: {e}")


alert_manager = AlertManager()


async def emit_operational_alert(alert: dict) -> dict:
    """
    Persists an operational alert to MongoDB and broadcasts it in real-time over SSE.
    """
    if "alert_id" not in alert:
        alert["alert_id"] = f"alt_{uuid.uuid4().hex[:10]}"
    if "created_at" not in alert:
        alert["created_at"] = datetime.now(timezone.utc).isoformat()
    if "status" not in alert:
        alert["status"] = "active"

    # Persist to database
    try:
        await mongo_db.alerts_collection.update_one(
            {"alert_id": alert["alert_id"], "university_id": alert.get("university_id")},
            {"$set": alert},
            upsert=True
        )
    except Exception as e:
        logger.warning(f"Failed to persist alert {alert.get('alert_id')}: {e}")

    # Broadcast via SSE
    await alert_manager.broadcast(alert)
    return alert


async def event_generator(request: Request, university_id: str):
    q = asyncio.Queue()
    alert_manager.register(q, university_id)
    try:
        while True:
            if await request.is_disconnected():
                break
            
            try:
                # Wait for an alert, but timeout every 5 seconds to send a heartbeat
                message = await asyncio.wait_for(q.get(), timeout=5.0)
                yield f"data: {json.dumps(message)}\n\n"
            except asyncio.TimeoutError:
                # Yield a JSON heartbeat message formatted strictly as an SSE payload
                yield f"data: {json.dumps({'type': 'heartbeat', 'status': 'alive'})}\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        alert_manager.unregister(q)


@router.get("/stream")
async def stream_alerts(request: Request, current_user: dict = Depends(get_current_user_ws)):
    univ_id = current_user.get("university_id", "demo-university")
    return StreamingResponse(event_generator(request, univ_id), media_type="text/event-stream")


@router.get("/feed")
@router.get("/history")
async def get_alerts_history(
    limit: int = Query(50, ge=1, le=100),
    status: Optional[str] = Query(None, description="Filter by status: active | resolved"),
    current_user: dict = Depends(require_roles(["admin", "teacher", "student"])),
):
    """
    Returns historical operational alerts for the active tenant.
    """
    univ_id = current_user.get("university_id", "demo-university")
    query: Dict[str, Any] = {"university_id": univ_id}
    if status:
        query["status"] = status

    cursor = mongo_db.alerts_collection.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    alerts = await cursor.to_list(length=limit)
    return alerts


@router.patch("/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Marks an operational alert as resolved in the tenant database.
    """
    univ_id = current_user.get("university_id", "demo-university")
    res = await mongo_db.alerts_collection.update_one(
        {"alert_id": alert_id, "university_id": univ_id},
        {"$set": {"status": "resolved", "resolved_at": datetime.now(timezone.utc).isoformat()}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"status": "success", "alert_id": alert_id, "state": "resolved"}
