"""POST /api/projects/{pid}/documents/{did}/retry."""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.routers.documents import retry_document


def _make_doc(*, status: str, retry_count: int = 0) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        processing_status=status,
        processing_error="boom",
        error_class="RuntimeError",
        pipeline_step=4,
        pipeline_step_label="merge",
        pipeline_updated_at=None,
        retry_count=retry_count,
        arq_job_id="old-job-id",
    )


def _exec_returning(doc) -> AsyncMock:
    exec_mock = AsyncMock()
    exec_mock.return_value = SimpleNamespace(scalar_one_or_none=lambda: doc)
    return exec_mock


async def test_retry_on_failed_doc_increments_count_and_resets_fields():
    doc = _make_doc(status="failed", retry_count=2)
    db = AsyncMock()
    db.execute = _exec_returning(doc)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    enqueue_mock = AsyncMock()
    with patch("app.routers.documents._enqueue_pipeline", enqueue_mock):
        result = await retry_document(
            project_id=doc.project_id,
            doc_id=doc.id,
            db=db,
            _member=MagicMock(),
        )

    assert result is doc
    assert doc.processing_status == "pending"
    assert doc.processing_error is None
    assert doc.error_class is None
    assert doc.pipeline_step is None
    assert doc.pipeline_step_label is None
    assert doc.retry_count == 3
    assert doc.arq_job_id != "old-job-id"
    enqueue_mock.assert_awaited_once()
    _, kwargs = enqueue_mock.await_args
    assert kwargs["job_id"] == doc.arq_job_id


async def test_retry_on_cancelled_doc_allowed():
    doc = _make_doc(status="cancelled", retry_count=0)
    db = AsyncMock()
    db.execute = _exec_returning(doc)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with patch("app.routers.documents._enqueue_pipeline", AsyncMock()):
        await retry_document(
            project_id=doc.project_id,
            doc_id=doc.id,
            db=db,
            _member=MagicMock(),
        )

    assert doc.processing_status == "pending"
    assert doc.retry_count == 1


async def test_retry_on_processing_doc_returns_409():
    doc = _make_doc(status="processing")
    db = AsyncMock()
    db.execute = _exec_returning(doc)

    with pytest.raises(HTTPException) as ei:
        await retry_document(
            project_id=doc.project_id,
            doc_id=doc.id,
            db=db,
            _member=MagicMock(),
        )

    assert ei.value.status_code == 409
    assert ei.value.detail["code"] == "not_retryable"
    assert ei.value.detail["processing_status"] == "processing"


async def test_retry_on_done_doc_returns_409():
    # `done` is not retryable here — use /reprocess for re-running successful docs.
    doc = _make_doc(status="done")
    db = AsyncMock()
    db.execute = _exec_returning(doc)

    with pytest.raises(HTTPException) as ei:
        await retry_document(
            project_id=doc.project_id,
            doc_id=doc.id,
            db=db,
            _member=MagicMock(),
        )

    assert ei.value.status_code == 409
