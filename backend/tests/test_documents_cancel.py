"""DELETE /api/projects/{pid}/documents/{did} with cancel_pipeline flag.

We exercise the router function directly with mocked session, redis, and
storage. Two scenarios:

1. `cancel_pipeline=True` flips status to 'cancelled', writes the redis
   cancel-key, and publishes a pipeline_cancelled SSE event. The doc row is
   NOT removed.
2. `cancel_pipeline=False` (default) = soft delete: archived_at set, state
   recomposed, Qdrant vectors deleted, document_archived SSE published.
   The doc row is NOT physically deleted.
"""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.routers.documents import delete_document


def _make_doc(*, status: str = "processing", arq_job_id: str | None = "job-abc") -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        original_path="projects/x/y.pdf",
        processing_status=status,
        arq_job_id=arq_job_id,
        pipeline_updated_at=None,
        archived_at=None,
    )


def _exec_returning(doc) -> AsyncMock:
    """Mimic AsyncSession.execute → result.scalar_one_or_none() → doc."""
    exec_mock = AsyncMock()
    exec_mock.return_value = SimpleNamespace(scalar_one_or_none=lambda: doc)
    return exec_mock


async def test_cancel_pipeline_flag_marks_doc_cancelled_and_sets_redis_key():
    doc = _make_doc(status="processing", arq_job_id="job-cancel")
    db = AsyncMock()
    db.execute = _exec_returning(doc)
    db.commit = AsyncMock()

    redis_mock = AsyncMock()
    redis_mock.set = AsyncMock()
    redis_mock.aclose = AsyncMock()

    publish_mock = AsyncMock()

    with patch("app.routers.documents._redis", return_value=redis_mock), patch(
        "app.routers.documents._publish", publish_mock
    ):
        result = await delete_document(
            project_id=doc.project_id,
            doc_id=doc.id,
            cancel_pipeline=True,
            db=db,
            _member=MagicMock(),
        )

    # Cancel branch returns None (no body) and never deletes the row.
    assert result is None
    db.delete.assert_not_called()
    redis_mock.set.assert_awaited_once()
    args, kwargs = redis_mock.set.call_args
    assert args[0] == "cancel:job-cancel"
    assert args[1] == "1"
    assert kwargs.get("ex") == 3600
    assert doc.processing_status == "cancelled"
    publish_mock.assert_awaited_once()
    channel, event = publish_mock.await_args.args
    assert channel == f"pipeline:{doc.project_id}"
    assert event["event"] == "pipeline_cancelled"
    assert event["document_id"] == str(doc.id)


async def test_cancel_pipeline_without_arq_job_id_still_marks_cancelled():
    doc = _make_doc(status="pending", arq_job_id=None)
    db = AsyncMock()
    db.execute = _exec_returning(doc)
    db.commit = AsyncMock()

    redis_mock = AsyncMock()
    redis_mock.set = AsyncMock()
    redis_mock.aclose = AsyncMock()

    with patch("app.routers.documents._redis", return_value=redis_mock), patch(
        "app.routers.documents._publish", AsyncMock()
    ):
        await delete_document(
            project_id=doc.project_id,
            doc_id=doc.id,
            cancel_pipeline=True,
            db=db,
            _member=MagicMock(),
        )

    # No arq job → no cancel key set, but status still updated.
    redis_mock.set.assert_not_awaited()
    assert doc.processing_status == "cancelled"


async def test_delete_without_flag_runs_soft_delete_path():
    """Default delete (no cancel_pipeline) now soft-deletes: sets archived_at,
    recomposes state, publishes document_archived. Does NOT call db.delete."""
    doc = _make_doc(status="done", arq_job_id="job-x")

    empty_ps = SimpleNamespace(version=1, state={
        "core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []},
        "dynamic_sections": [], "custom": {},
    })

    db = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.add = MagicMock()

    call_count = 0

    async def side_effect_execute(q, *a, **kw):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return SimpleNamespace(scalar_one_or_none=lambda: doc)
        return SimpleNamespace(scalar_one_or_none=lambda: empty_ps)

    db.execute = side_effect_execute

    publish_mock = AsyncMock()
    qdrant_delete = AsyncMock()

    with (
        patch("app.routers.documents._publish", publish_mock),
        patch("app.services.qdrant_service.delete_by_document", qdrant_delete),
        patch("app.routers.documents.git_service.commit_state", MagicMock(return_value="abc")),
    ):
        await delete_document(
            project_id=doc.project_id,
            doc_id=doc.id,
            cancel_pipeline=False,
            db=db,
            _member=MagicMock(),
        )

    # Soft delete: archived_at is set, db.delete NOT called
    assert doc.archived_at is not None
    db.delete.assert_not_called()
    qdrant_delete.assert_awaited_once()
    publish_mock.assert_awaited_once()
    _, event = publish_mock.await_args.args
    assert event["event"] == "document_archived"
    assert event["strategy"] == "soft"
