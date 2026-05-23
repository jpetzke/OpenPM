"""git_revert strategy restores state to pre-upload version and sets archived_at."""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.routers.documents import delete_document


def _make_doc() -> SimpleNamespace:
    doc_id = uuid.uuid4()
    return SimpleNamespace(
        id=doc_id,
        project_id=uuid.uuid4(),
        original_path="projects/x/y.pdf",
        processing_status="done",
        arq_job_id="job-abc",
        archived_at=None,
        pipeline_updated_at=None,
    )


async def test_git_revert_finds_target_version_and_archives():
    doc = _make_doc()
    doc_id_str = str(doc.id)

    # Two project state versions: v1 without doc, v2 with doc referenced in state
    ps_v1 = SimpleNamespace(version=1, state={
        "core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []},
        "dynamic_sections": [], "custom": {},
    })
    ps_v2 = SimpleNamespace(version=2, state={
        "core": {
            "contacts": [],
            "open_tasks": [{"id": "t1", "title": "Task", "source_document_ids": [doc_id_str]}],
            "deadlines": [], "decisions": [], "blockers": [],
        },
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
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [ps_v1, ps_v2]))

    db.execute = side_effect_execute

    publish_mock = AsyncMock()
    git_revert_mock = MagicMock(return_value="rev-hash")
    qdrant_delete = AsyncMock()

    with (
        patch("app.routers.documents._publish", publish_mock),
        patch("app.routers.documents.git_service.revert_to_version", git_revert_mock),
        patch("app.services.qdrant_service.delete_by_document", qdrant_delete),
    ):
        result = await delete_document(
            project_id=doc.project_id,
            doc_id=doc.id,
            cancel_pipeline=False,
            strategy="git_revert",
            db=db,
            _member=MagicMock(),
        )

    assert doc.archived_at is not None
    git_revert_mock.assert_called_once()
    args = git_revert_mock.call_args.args
    # Should revert to v1 state (before doc was a source)
    assert args[1] == ps_v1.state
    assert f"revert: drop {doc.id}" in args[2]
    qdrant_delete.assert_awaited_once()
    publish_mock.assert_awaited_once()
    _, event = publish_mock.await_args.args
    assert event["event"] == "document_archived"
    assert event["strategy"] == "git_revert"


async def test_git_revert_with_no_prior_version_uses_empty_state():
    doc = _make_doc()
    doc_id_str = str(doc.id)

    ps_v1 = SimpleNamespace(version=1, state={
        "core": {
            "contacts": [],
            "open_tasks": [{"id": "t1", "source_document_ids": [doc_id_str]}],
            "deadlines": [], "decisions": [], "blockers": [],
        },
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
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [ps_v1]))

    db.execute = side_effect_execute

    git_revert_mock = MagicMock(return_value="hash-x")

    with (
        patch("app.routers.documents._publish", AsyncMock()),
        patch("app.routers.documents.git_service.revert_to_version", git_revert_mock),
        patch("app.services.qdrant_service.delete_by_document", AsyncMock()),
    ):
        await delete_document(
            project_id=doc.project_id,
            doc_id=doc.id,
            cancel_pipeline=False,
            strategy="git_revert",
            db=db,
            _member=MagicMock(),
        )

    # No prior version, so reverts to empty state
    git_revert_mock.assert_called_once()
    assert git_revert_mock.call_args.args[1] == {}
