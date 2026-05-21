import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import change_session as cs


def _mock_db_with_existing(session):
    """Build an async DB that returns `session` from the first select query."""
    db = AsyncMock()
    db.flush = AsyncMock()
    result = SimpleNamespace(scalar_one_or_none=MagicMock(return_value=session))
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()
    return db


@pytest.mark.asyncio
async def test_get_or_open_reuses_active_session():
    existing = SimpleNamespace(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        last_activity_at=datetime.now(timezone.utc),
        closed_at=None,
    )
    db = _mock_db_with_existing(existing)
    redis = AsyncMock()

    out = await cs.get_or_open(existing.project_id, db, redis)

    assert out is existing
    assert (datetime.now(timezone.utc) - out.last_activity_at).total_seconds() < 5
    db.add.assert_not_called()
    redis.publish.assert_not_called()


@pytest.mark.asyncio
async def test_get_or_open_creates_new_when_none():
    project_id = uuid.uuid4()
    db = _mock_db_with_existing(None)
    redis = AsyncMock()

    out = await cs.get_or_open(project_id, db, redis)

    assert out.project_id == project_id
    assert out.closed_at is None
    db.add.assert_called_once()
    redis.publish.assert_awaited_once()
    args, _ = redis.publish.call_args
    assert args[0] == f"pipeline:{project_id}"
    import json
    payload = json.loads(args[1])
    assert payload["event"] == "change_session_opened"


@pytest.mark.asyncio
async def test_aggregate_summary_counts_added_items():
    session = SimpleNamespace(id=uuid.uuid4(), project_id=uuid.uuid4())
    row1 = SimpleNamespace(
        delta={"added": {"core.open_tasks": [{}, {}], "core.deadlines": [{}]}},
        document_id=uuid.uuid4(),
        from_version=1,
        to_version=2,
        created_at=datetime.now(timezone.utc),
    )
    row2 = SimpleNamespace(
        delta={"added": {"core.contacts": [{}], "dynamic.notes": [{}, {}, {}]}},
        document_id=uuid.uuid4(),
        from_version=2,
        to_version=3,
        created_at=datetime.now(timezone.utc),
    )

    scalars = SimpleNamespace(all=MagicMock(return_value=[row1, row2]))
    result = SimpleNamespace(scalars=MagicMock(return_value=scalars))
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)

    out = await cs.aggregate_summary(session, db)
    assert out["tasks_added"] == 2
    assert out["deadlines_added"] == 1
    assert out["contacts_added"] == 1
    assert out["dynamic_items_added"] == 3
    assert out["document_count"] == 2
    assert out["from_version"] == 1
    assert out["to_version"] == 3


@pytest.mark.asyncio
async def test_close_idle_finalizes_only_stale_sessions(monkeypatch):
    stale_id = uuid.uuid4()
    stale = SimpleNamespace(
        id=stale_id,
        project_id=uuid.uuid4(),
        closed_at=None,
        summary=None,
        triggered_by=None,
        last_activity_at=datetime.now(timezone.utc) - timedelta(minutes=10),
    )
    scalars = SimpleNamespace(all=MagicMock(return_value=[stale]))
    result = SimpleNamespace(scalars=MagicMock(return_value=scalars))
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)

    async def fake_aggregate(_session, _db):
        return {"tasks_added": 1, "document_count": 1}

    monkeypatch.setattr(cs, "aggregate_summary", fake_aggregate)

    redis = AsyncMock()
    out = await cs.close_idle(db, redis)
    assert len(out) == 1
    closed = out[0]
    assert closed.triggered_by == "auto_idle"
    assert closed.summary == {"tasks_added": 1, "document_count": 1}
    assert closed.closed_at is not None
    redis.publish.assert_awaited_once()


@pytest.mark.asyncio
async def test_close_manual_returns_none_when_no_active(monkeypatch):
    result = SimpleNamespace(scalar_one_or_none=MagicMock(return_value=None))
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    out = await cs.close_manual(uuid.uuid4(), db, None)
    assert out is None
