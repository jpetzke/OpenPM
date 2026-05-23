"""Restore clears archived_at and re-enqueues pipeline."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.routers.documents import restore_document


def _make_archived_doc() -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        original_path="projects/x/y.pdf",
        processing_status="done",
        arq_job_id="job-old",
        archived_at=datetime.now(timezone.utc),
        pipeline_updated_at=None,
        pipeline_step=None,
        pipeline_step_label=None,
        processing_error=None,
    )


async def test_restore_clears_archived_at_and_re_enqueues():
    doc = _make_archived_doc()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: doc))
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    enqueue_mock = AsyncMock()

    with patch("app.routers.documents._enqueue_pipeline", enqueue_mock):
        await restore_document(
            project_id=doc.project_id,
            doc_id=doc.id,
            db=db,
            _member=MagicMock(),
        )

    assert doc.archived_at is None
    assert doc.processing_status == "pending"
    enqueue_mock.assert_awaited_once()
