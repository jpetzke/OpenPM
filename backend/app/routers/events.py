import asyncio
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis

from app.auth import get_current_user, get_project_member
from app.config import settings
from app.models.project import ProjectMember
from app.models.user import User

router = APIRouter(prefix="/api/projects/{project_id}/events", tags=["events"])

HEARTBEAT_SECONDS = 20

# Force any intermediate proxy (Next.js dev rewrite, nginx, etc.) to flush
# the response head and start streaming immediately.
_PROXY_BUFFER_PADDING = (":" + (" " * 2048) + "\n\n").encode()

# Explicit headers that tell every common proxy in the stack to NOT buffer.
SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
}


def _hb_payload() -> str:
    return json.dumps({"event": "heartbeat", "ts": datetime.now(timezone.utc).isoformat()})


@router.get("")
async def sse_events(
    project_id: uuid.UUID,
    _member: ProjectMember = Depends(get_project_member),
    current_user: User = Depends(get_current_user),
):
    channel = f"pipeline:{project_id}"

    async def generate():
        # Padding forces any proxy that buffers the response head to flush
        # before the first real event. ~2 KB is enough to defeat nginx defaults
        # without bloating the stream.
        yield _PROXY_BUFFER_PADDING
        redis = Redis.from_url(settings.redis_url, decode_responses=True)
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            yield b'data: {"event": "connected"}\n\n'
            yield f"data: {_hb_payload()}\n\n".encode()
            while True:
                try:
                    message = await pubsub.get_message(
                        ignore_subscribe_messages=True,
                        timeout=HEARTBEAT_SECONDS,
                    )
                except Exception:
                    return
                if message and message.get("type") == "message":
                    yield f"data: {message['data']}\n\n".encode()
                else:
                    yield f"data: {_hb_payload()}\n\n".encode()
        except asyncio.CancelledError:
            pass
        finally:
            try:
                await pubsub.unsubscribe(channel)
            except Exception:
                pass
            try:
                await redis.aclose()
            except Exception:
                pass

    return StreamingResponse(generate(), media_type="text/event-stream", headers=SSE_HEADERS)
