"""Section M: project archive/unarchive/seen + badge serialization.

Live end-to-end was smoke-tested via curl against the running stack; these lock
the contract so the serialization layer (ProjectResponse) can't silently drop
the new fields the way J/K/L did.
"""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.routers.projects import (
    _project_response,
    archive_project,
    mark_project_seen,
    unarchive_project,
)


def _make_project(*, status: str = "active", archived_at=None) -> SimpleNamespace:
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=uuid.uuid4(),
        name="Alpha",
        client_name="Corp",
        status=status,
        compiled_briefing=None,
        briefing_token_count=None,
        briefing_was_truncated=None,
        briefing_state_version=None,
        briefing_priority_order=None,
        custom_instructions=None,
        monthly_budget_usd=None,
        archived_at=archived_at,
        last_activity_at=now,
        stale_marker=False,
        created_at=now,
        updated_at=now,
        created_by=uuid.uuid4(),
    )


def test_project_response_serializes_new_fields():
    """The render-tree gap: new columns MUST appear in the response."""
    p = _make_project()
    resp = _project_response(
        p,
        document_count=2,
        open_task_count=3,
        failed_document_count=4,
        unread_change_count=5,
    )
    assert resp.failed_document_count == 4
    assert resp.unread_change_count == 5
    assert resp.archived_at is None
    # custom_instructions must round-trip through the response builder
    assert resp.custom_instructions is None
    p.custom_instructions = "Antworte auf Englisch."
    assert _project_response(p).custom_instructions == "Antworte auf Englisch."
    # default 0 when not supplied
    assert _project_response(p).failed_document_count == 0
    assert _project_response(p).unread_change_count == 0


class _EnrichlessDB:
    """Minimal AsyncSession stub. archive/unarchive do: _get_project_or_404
    (execute → scalar_one_or_none == project), mutate, commit, refresh, then
    _enrich_single_project (scalar counts + execute for state/members). Only the
    first execute should return the project; later ones return empty."""

    def __init__(self, project):
        self._project = project
        self._execute_calls = 0
        self.commit = AsyncMock()
        self.add = MagicMock()
        self.refresh = AsyncMock()

    async def execute(self, *_a, **_k):
        self._execute_calls += 1
        if self._execute_calls == 1:
            return SimpleNamespace(
                scalar_one_or_none=lambda: self._project, all=lambda: [], one_or_none=lambda: None
            )
        return SimpleNamespace(
            scalar_one_or_none=lambda: None, all=lambda: [], one_or_none=lambda: None
        )

    async def scalar(self, *_a, **_k):
        return 0


async def test_archive_sets_status_and_timestamp():
    p = _make_project()
    db = _EnrichlessDB(p)
    user = SimpleNamespace(id=uuid.uuid4())
    resp = await archive_project(p.id, current_user=user, db=db, _member=None)
    assert p.status == "archived"
    assert p.archived_at is not None
    assert resp.status == "archived"
    db.commit.assert_awaited()


async def test_unarchive_clears_timestamp_and_reactivates():
    p = _make_project(status="archived", archived_at=datetime.now(timezone.utc))
    db = _EnrichlessDB(p)
    user = SimpleNamespace(id=uuid.uuid4())
    resp = await unarchive_project(p.id, current_user=user, db=db, _member=None)
    assert p.archived_at is None
    assert p.status == "active"
    assert resp.archived_at is None


async def test_mark_seen_inserts_view_when_absent():
    p = _make_project()
    db = _EnrichlessDB(p)
    # no existing view → execute().scalar_one_or_none() returns None
    db.execute = AsyncMock(
        return_value=SimpleNamespace(scalar_one_or_none=lambda: None)
    )
    user = SimpleNamespace(id=uuid.uuid4())
    await mark_project_seen(p.id, current_user=user, db=db, _member=None)
    db.add.assert_called_once()
    db.commit.assert_awaited()
