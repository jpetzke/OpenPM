"""Dry-run returns diff without modifying state row count."""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.routers.documents import replace_document


def _make_doc() -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        original_path="projects/x/y.pdf",
        processing_status="done",
        arq_job_id="job-abc",
        archived_at=None,
        pipeline_updated_at=None,
        original_filename="v1.txt",
    )


def _upload_file(name: str = "v2.txt") -> MagicMock:
    f = MagicMock()
    f.filename = name
    f.content_type = "text/plain"
    f.read = AsyncMock(return_value=b"New content about a task: Deploy API by 2026-06-01.")
    return f


async def test_dry_run_returns_diff_without_state_mutation():
    doc = _make_doc()

    db = AsyncMock()
    call_count = 0
    current_state = {
        "core": {
            "contacts": [],
            "open_tasks": [{"id": "t1", "title": "Old task", "source_document_ids": [str(doc.id)]}],
            "deadlines": [], "decisions": [], "blockers": [],
        },
        "dynamic_sections": [], "custom": {},
    }
    ps = SimpleNamespace(version=2, state=current_state)

    async def side_effect_execute(q, *a, **kw):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return SimpleNamespace(scalar_one_or_none=lambda: doc)
        return SimpleNamespace(scalar_one_or_none=lambda: ps)

    db.execute = side_effect_execute
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()

    new_delta = {
        "core": {
            "contacts": [],
            "open_tasks": [{"title": "Deploy API", "status": "open"}],
            "deadlines": [], "decisions": [], "blockers": [],
        },
        "dynamic_sections": [],
    }

    with (
        patch("app.services.extraction.parse_document", AsyncMock(return_value=("New content", {}, []))),
        patch("app.services.extraction.extract_state_delta", AsyncMock(return_value=(new_delta, []))),
        patch("app.routers.documents.get_active_provider", AsyncMock(return_value=MagicMock())),
    ):
        result = await replace_document(
            project_id=doc.project_id,
            doc_id=doc.id,
            file=_upload_file(),
            dry_run=True,
            db=db,
            current_user=MagicMock(id=uuid.uuid4()),
            _member=MagicMock(),
        )

    # No new DB rows should have been committed
    db.commit.assert_not_called()
    db.add.assert_not_called()
    # Result is a DiffPreview
    assert hasattr(result, "additions")
    assert hasattr(result, "removals")
    assert hasattr(result, "modifications")
