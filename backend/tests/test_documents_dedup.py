"""POST /api/projects/{pid}/documents/text — content-hash dedup.

We use the /text endpoint (rather than the multipart upload) because it
doesn't go through UploadFile / disk-streaming, so the test stays self-
contained without filesystem fixtures. The dedup logic is identical between
the two endpoints (same hash check + 409 detail).
"""
from __future__ import annotations

import hashlib
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.routers.documents import create_text_document
from app.schemas.document import TextDocumentCreate


def _make_db_with_existing(existing_doc) -> AsyncMock:
    db = AsyncMock()
    # The dedup query returns the existing doc; .scalars().first() chain.
    scalars_mock = MagicMock()
    scalars_mock.first = MagicMock(return_value=existing_doc)
    db.execute = AsyncMock(return_value=SimpleNamespace(scalars=lambda: scalars_mock))
    return db


def _make_db_without_match() -> AsyncMock:
    db = AsyncMock()
    scalars_mock = MagicMock()
    scalars_mock.first = MagicMock(return_value=None)
    db.execute = AsyncMock(return_value=SimpleNamespace(scalars=lambda: scalars_mock))
    return db


async def test_duplicate_returns_409_with_structured_detail():
    project_id = uuid.uuid4()
    payload = TextDocumentCreate(content="hello world", title="notes")

    existing = SimpleNamespace(
        id=uuid.uuid4(),
        original_filename="notes-original.txt",
    )
    db = _make_db_with_existing(existing)

    with patch(
        "app.routers.documents.get_active_provider", AsyncMock(return_value=MagicMock())
    ):
        with pytest.raises(HTTPException) as ei:
            await create_text_document(
                project_id=project_id,
                payload=payload,
                allow_duplicate=False,
                db=db,
                current_user=SimpleNamespace(id=uuid.uuid4()),
                _member=MagicMock(),
            )

    assert ei.value.status_code == 409
    detail = ei.value.detail
    assert detail["code"] == "duplicate"
    assert detail["existing_document_id"] == str(existing.id)
    assert detail["filename"] == "notes-original.txt"


async def test_allow_duplicate_true_bypasses_check():
    project_id = uuid.uuid4()
    payload = TextDocumentCreate(content="hello world", title="notes")

    existing = SimpleNamespace(
        id=uuid.uuid4(),
        original_filename="notes-original.txt",
    )

    # Even with a duplicate present, allow_duplicate=true should skip the check
    # and proceed. We stub the downstream calls (storage, change_session, enqueue).
    db = AsyncMock()
    # No dedup query is expected because the branch is skipped — but the endpoint
    # still does an `await db.refresh(doc)` etc. Use generic AsyncMock for execute.
    db.execute = AsyncMock(return_value=SimpleNamespace(
        scalars=lambda: MagicMock(first=MagicMock(return_value=existing))
    ))
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()

    with patch(
        "app.routers.documents.get_active_provider", AsyncMock(return_value=MagicMock())
    ), patch(
        "app.routers.documents.storage_service.save_document", return_value="storage/path.txt"
    ), patch(
        "app.routers.documents._attach_change_session", AsyncMock(return_value=uuid.uuid4())
    ), patch(
        "app.routers.documents._publish_queued", AsyncMock()
    ), patch(
        "app.routers.documents._enqueue_pipeline", AsyncMock()
    ), patch(
        "app.routers.documents.DocumentUploadResponse",
        side_effect=lambda **kw: SimpleNamespace(**kw),
    ), patch(
        "app.routers.documents.DocumentResponse.model_validate",
        side_effect=lambda d: SimpleNamespace(),
    ):
        result = await create_text_document(
            project_id=project_id,
            payload=payload,
            allow_duplicate=True,
            db=db,
            current_user=SimpleNamespace(id=uuid.uuid4()),
            _member=MagicMock(),
        )

    assert result is not None
    db.add.assert_called_once()
    added_doc = db.add.call_args.args[0]
    assert added_doc.content_hash == hashlib.sha256(b"hello world").hexdigest()
    assert added_doc.arq_job_id is not None


async def test_unique_content_proceeds_normally():
    project_id = uuid.uuid4()
    payload = TextDocumentCreate(content="completely new content", title="fresh")

    db = _make_db_without_match()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()

    enqueue_mock = AsyncMock()
    with patch(
        "app.routers.documents.get_active_provider", AsyncMock(return_value=MagicMock())
    ), patch(
        "app.routers.documents.storage_service.save_document", return_value="storage/path.txt"
    ), patch(
        "app.routers.documents._attach_change_session", AsyncMock(return_value=uuid.uuid4())
    ), patch(
        "app.routers.documents._publish_queued", AsyncMock()
    ), patch(
        "app.routers.documents._enqueue_pipeline", enqueue_mock
    ), patch(
        "app.routers.documents.DocumentUploadResponse",
        side_effect=lambda **kw: SimpleNamespace(**kw),
    ), patch(
        "app.routers.documents.DocumentResponse.model_validate",
        side_effect=lambda d: SimpleNamespace(),
    ):
        await create_text_document(
            project_id=project_id,
            payload=payload,
            allow_duplicate=False,
            db=db,
            current_user=SimpleNamespace(id=uuid.uuid4()),
            _member=MagicMock(),
        )

    # Hash + arq_job_id wired up; enqueue called with the same job id.
    db.add.assert_called_once()
    added = db.add.call_args.args[0]
    expected_hash = hashlib.sha256(b"completely new content").hexdigest()
    assert added.content_hash == expected_hash
    assert added.arq_job_id
    enqueue_mock.assert_awaited_once()
    _, kwargs = enqueue_mock.await_args
    assert kwargs["job_id"] == added.arq_job_id
