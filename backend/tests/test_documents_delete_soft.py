"""Soft delete sets archived_at, recomposes state, deletes Qdrant vectors, publishes SSE."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.routers.documents import delete_document


def _make_doc(*, status: str = "done") -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        original_path="projects/x/y.pdf",
        processing_status=status,
        arq_job_id="job-abc",
        archived_at=None,
        pipeline_updated_at=None,
    )


def _exec_returning_doc(doc) -> AsyncMock:
    exec_mock = AsyncMock()
    exec_mock.return_value = SimpleNamespace(scalar_one_or_none=lambda: doc)
    return exec_mock


def _make_db_with_doc(doc):
    db = AsyncMock()
    db.execute = _exec_returning_doc(doc)
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db.add = MagicMock()
    return db


async def test_soft_delete_sets_archived_at():
    doc = _make_doc()
    db = _make_db_with_doc(doc)

    empty_state = {
        "core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []},
        "dynamic_sections": [], "custom": {},
    }
    mock_ps = SimpleNamespace(version=3, state=empty_state)
    ps_exec = AsyncMock()
    ps_exec.return_value = SimpleNamespace(scalar_one_or_none=lambda: mock_ps)

    call_count = 0
    original_execute = db.execute

    async def side_effect_execute(q, *a, **kw):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return await original_execute(q, *a, **kw)
        return await ps_exec(q, *a, **kw)

    db.execute = side_effect_execute

    qdrant_delete = AsyncMock()
    publish_mock = AsyncMock()
    git_mock = MagicMock(return_value="abc123")

    with (
        patch("app.routers.documents._publish", publish_mock),
        patch("app.services.qdrant_service.delete_by_document", qdrant_delete),
        patch("app.routers.documents.git_service.commit_state", git_mock),
    ):
        result = await delete_document(
            project_id=doc.project_id,
            doc_id=doc.id,
            cancel_pipeline=False,
            strategy="soft",
            db=db,
            _member=MagicMock(),
        )

    assert doc.archived_at is not None
    qdrant_delete.assert_awaited_once()
    publish_mock.assert_awaited_once()
    _, event = publish_mock.await_args.args
    assert event["event"] == "document_archived"
    assert event["strategy"] == "soft"
    assert "removed" in event


async def test_soft_delete_does_not_hard_delete_db_row():
    doc = _make_doc()
    db = _make_db_with_doc(doc)

    empty_state = {
        "core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []},
        "dynamic_sections": [], "custom": {},
    }
    mock_ps = SimpleNamespace(version=1, state=empty_state)
    call_count = 0
    original_execute = db.execute

    async def side_effect_execute(q, *a, **kw):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return await original_execute(q, *a, **kw)
        return SimpleNamespace(scalar_one_or_none=lambda: mock_ps)

    db.execute = side_effect_execute

    with (
        patch("app.routers.documents._publish", AsyncMock()),
        patch("app.services.qdrant_service.delete_by_document", AsyncMock()),
        patch("app.routers.documents.git_service.commit_state", MagicMock(return_value="x")),
    ):
        await delete_document(
            project_id=doc.project_id,
            doc_id=doc.id,
            cancel_pipeline=False,
            strategy="soft",
            db=db,
            _member=MagicMock(),
        )

    db.delete.assert_not_called()
