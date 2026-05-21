"""Change session lifecycle: open on first activity, close after idle window.

A ChangeSession groups together state_changelog rows produced by a burst of
document uploads, so the user-facing changelog reads as one session ("3 docs,
+5 tasks, +2 deadlines") instead of N noisy rows.

Live state itself is unaffected — each pipeline run still writes a new
project_state version. Only changelog grouping is session-scoped.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.state import ChangeSession, StateChangelog

log = structlog.get_logger()

SESSION_IDLE_SECONDS = 5 * 60


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _publish(redis: Any | None, channel: str, event: dict) -> None:
    if redis is None:
        return
    try:
        await redis.publish(channel, json.dumps(event, default=str))
    except Exception as exc:  # noqa: BLE001
        log.warning("change_session_publish_failed", error=str(exc))


async def get_or_open(
    project_id: uuid.UUID,
    db: AsyncSession,
    redis: Any | None = None,
) -> ChangeSession:
    """Return the active session for the project, opening a new one if needed.

    Bumps `last_activity_at` to now so the idle window resets on every call.
    """
    cutoff = _now() - timedelta(seconds=SESSION_IDLE_SECONDS)
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

    if session is not None:
        session.last_activity_at = _now()
        await db.flush()
        return session

    session = ChangeSession(
        id=uuid.uuid4(),
        project_id=project_id,
        started_at=_now(),
        last_activity_at=_now(),
    )
    db.add(session)
    await db.flush()
    channel = f"pipeline:{project_id}"
    await _publish(
        redis,
        channel,
        {
            "event": "change_session_opened",
            "session_id": str(session.id),
            "started_at": session.started_at.isoformat(),
        },
    )
    return session


async def aggregate_summary(session: ChangeSession, db: AsyncSession) -> dict:
    """Compute a roll-up of all changelog rows belonging to a session."""
    rows_result = await db.execute(
        select(StateChangelog)
        .where(StateChangelog.change_session_id == session.id)
        .order_by(StateChangelog.created_at.asc())
    )
    rows = list(rows_result.scalars().all())

    totals = {
        "contacts_added": 0,
        "tasks_added": 0,
        "deadlines_added": 0,
        "decisions_added": 0,
        "blockers_added": 0,
        "dynamic_items_added": 0,
    }
    doc_ids: list[str] = []
    for row in rows:
        added = (row.delta or {}).get("added", {}) or {}
        totals["contacts_added"] += len(added.get("core.contacts", []) or [])
        totals["tasks_added"] += len(added.get("core.open_tasks", []) or [])
        totals["deadlines_added"] += len(added.get("core.deadlines", []) or [])
        totals["decisions_added"] += len(added.get("core.decisions", []) or [])
        totals["blockers_added"] += len(added.get("core.blockers", []) or [])
        for k, v in added.items():
            if k.startswith("dynamic.") and isinstance(v, list):
                totals["dynamic_items_added"] += len(v)
        if row.document_id is not None:
            doc_ids.append(str(row.document_id))

    return {
        **totals,
        "document_count": len(doc_ids),
        "document_ids": doc_ids,
        "from_version": rows[0].from_version if rows else None,
        "to_version": rows[-1].to_version if rows else None,
    }


async def close_manual(
    session_id: uuid.UUID,
    db: AsyncSession,
    redis: Any | None = None,
) -> ChangeSession | None:
    """Close a specific session immediately."""
    result = await db.execute(
        select(ChangeSession).where(
            ChangeSession.id == session_id,
            ChangeSession.closed_at.is_(None),
        )
    )
    session = result.scalar_one_or_none()
    if session is None:
        return None
    return await _finalize(session, "manual_close", db, redis)


async def close_idle(db: AsyncSession, redis: Any | None = None) -> list[ChangeSession]:
    """Close every session whose last_activity_at is older than the idle window."""
    cutoff = _now() - timedelta(seconds=SESSION_IDLE_SECONDS)
    result = await db.execute(
        select(ChangeSession).where(
            ChangeSession.closed_at.is_(None),
            ChangeSession.last_activity_at < cutoff,
        )
    )
    sessions = list(result.scalars().all())
    closed: list[ChangeSession] = []
    for session in sessions:
        finalized = await _finalize(session, "auto_idle", db, redis)
        if finalized is not None:
            closed.append(finalized)
    return closed


async def _finalize(
    session: ChangeSession,
    triggered_by: str,
    db: AsyncSession,
    redis: Any | None,
) -> ChangeSession:
    summary = await aggregate_summary(session, db)
    session.closed_at = _now()
    session.summary = summary
    session.triggered_by = triggered_by
    await db.flush()
    channel = f"pipeline:{session.project_id}"
    await _publish(
        redis,
        channel,
        {
            "event": "change_session_closed",
            "session_id": str(session.id),
            "closed_at": session.closed_at.isoformat(),
            "summary": summary,
            "triggered_by": triggered_by,
        },
    )
    return session
