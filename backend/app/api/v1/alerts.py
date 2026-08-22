import asyncio
import json
from fastapi import APIRouter, Request, Depends
from fastapi.responses import StreamingResponse

router = APIRouter()

class AlertManager:
    def __init__(self):
        self.queues = []

    async def broadcast(self, message: dict):
        for q in self.queues:
            await q.put(message)

alert_manager = AlertManager()

async def event_generator(request: Request):
    q = asyncio.Queue()
    alert_manager.queues.append(q)
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
        if q in alert_manager.queues:
            alert_manager.queues.remove(q)

from app.api.v1.deps import get_current_user_ws

@router.get("/stream")
async def stream_alerts(request: Request, current_user: dict = Depends(get_current_user_ws)):
    return StreamingResponse(event_generator(request), media_type="text/event-stream")
