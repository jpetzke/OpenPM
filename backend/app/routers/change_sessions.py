"""HTTP endpoints for inspecting and closing the active change session."""

from __future__ import annotations

import uuid
from datetime import timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_project_member
from app.config import settings
from app.database import get_db
from app.models.project import ProjectMember
from app.models.state import ChangeSession
from app.schemas.state import ChangeSessionResponse
from app.services import change_session as change_session_service

log = structlog.get_logger()

router = APIRouter(
    prefix="/api/projects/{project_id}/change-sessions",
    tags=["change-sessions"],
)


async def _redis():
    return Redis.from_url(settings.redis_url, decode_responses=True)


@router.get("/current", response_model=ChangeSessionResponse | None)
async def get_current_session(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    cutoff = change_session_service._now() - timedelta(seconds=change_session_service.SESSION_IDLE_SECONDS)
    result = await db.execute(
        select(ChangeSession)
        .where(
            ChangeSession.project_id == project_id,
            ChangeSession.closed_at.is_(None),
            ChangeSession.last_activity_at > cutoff,
        )
        .order_by(ChangeSession.started_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.post("/close", response_model=ChangeSessionResponse | None)
async def close_current_session(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    cutoff = change_session_service._now() - timedelta(seconds=change_session_service.SESSION_IDLE_SECONDS)
    result = await db.execute(
        select(ChangeSession)
        .where(
            ChangeSession.project_id == project_id,
            ChangeSession.closed_at.is_(None),
            ChangeSession.last_activity_at > cutoff,
        )
        .order_by(ChangeSession.started_at.desc())
        .limit(1)
    )
    session = result.scalar_one_or_none()
    if session is None:
        return None
    redis = await _redis()
    try:
        closed = await change_session_service.close_manual(session.id, db, redis)
        await db.commit()
        return closed
    finally:
        await redis.aclose()
