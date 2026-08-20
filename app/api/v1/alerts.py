import asyncio
import json
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter()

async def event_generator(request: Request):
    try:
        while True:
            if await request.is_disconnected():
                break
            
            # Yield a JSON heartbeat message formatted strictly as an SSE payload
            yield f"data: {json.dumps({'type': 'heartbeat', 'status': 'alive'})}\n\n"
            
            # Prevent CPU flooding
            await asyncio.sleep(5)
    except asyncio.CancelledError:
        # Cleanly exit the coroutine upon client disconnection
        pass

@router.get("/stream")
async def stream_alerts(request: Request):
    return StreamingResponse(event_generator(request), media_type="text/event-stream")
