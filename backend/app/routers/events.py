import asyncio
import json
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis

from app.auth import get_current_user, get_project_member
from app.config import settings
from app.models.project import ProjectMember
from app.models.user import User

router = APIRouter(prefix="/api/projects/{project_id}/events", tags=["events"])


@router.get("")
async def sse_events(
    project_id: uuid.UUID,
    _member: ProjectMember = Depends(get_project_member),
    current_user: User = Depends(get_current_user),
):
    channel = f"pipeline:{project_id}"

    async def generate():
        redis = Redis.from_url(settings.redis_url, decode_responses=True)
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            yield "data: {\"type\": \"connected\"}\n\n"
            async for message in pubsub.listen():
                if message["type"] == "message":
                    yield f"data: {message['data']}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(channel)
            await redis.aclose()

    return StreamingResponse(generate(), media_type="text/event-stream")
