"""Replace commit: sets replaces_document_id FK, archives old doc, enqueues new pipeline."""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.routers.documents import replace_document
from app.schemas.document import DocumentResponse


def _make_doc() -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        original_path="projects/x/old.txt",
        processing_status="done",
        arq_job_id="job-old",
        archived_at=None,
        pipeline_updated_at=None,
        original_filename="v1.txt",
        content_hash=None,
        replaces_document_id=None,
    )


def _upload_file(name: str = "v2.txt") -> MagicMock:
    f = MagicMock()
    f.filename = name
    f.content_type = "text/plain"
    f.read = AsyncMock(return_value=b"Replacement document content.")
    return f


async def test_replace_commit_archives_old_doc_and_sets_fk():
    old_doc = _make_doc()

    saved_new_doc = None
    empty_ps = SimpleNamespace(version=1, state={
        "core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []},
        "dynamic_sections": [], "custom": {},
    })

    class FakeDB:
        def __init__(self):
            self.committed = False
            self._flush_count = 0
            self._exec_count = 0

        async def execute(self, q, *a, **kw):
            self._exec_count += 1
            if self._exec_count == 1:
                # _get_doc_or_404
                return SimpleNamespace(scalar_one_or_none=lambda: old_doc)
            # _get_current_project_state
            return SimpleNamespace(scalar_one_or_none=lambda: empty_ps)

        def add(self, obj):
            nonlocal saved_new_doc
            from app.models.document import Document as DocModel
            if isinstance(obj, DocModel):
                saved_new_doc = obj

        async def flush(self):
            self._flush_count += 1

        async def commit(self):
            self.committed = True

        async def refresh(self, obj):
            pass

    db = FakeDB()

    enqueue_mock = AsyncMock()
    git_mock = MagicMock(return_value="hash-new")
    qdrant_delete = AsyncMock()
    storage_stream = AsyncMock(return_value=("projects/x/new.txt", 28))
    storage_bytes = MagicMock(return_value=b"Replacement document content.")

    # Fake model_validate to avoid ORM validation on mock object
    fake_response = MagicMock(spec=DocumentResponse)

    with (
        patch("app.routers.documents.get_active_provider", AsyncMock(return_value=MagicMock())),
        patch("app.routers.documents.storage_service.stream_document_to_disk", storage_stream),
        patch("app.routers.documents.storage_service.get_document_bytes", storage_bytes),
        patch("app.routers.documents._enqueue_pipeline", enqueue_mock),
        patch("app.routers.documents.git_service.commit_state", git_mock),
        patch("app.services.qdrant_service.delete_by_document", qdrant_delete),
        patch("app.routers.documents._publish", AsyncMock()),
        patch("app.routers.documents._attach_change_session", AsyncMock(return_value=uuid.uuid4())),
        patch("app.routers.documents._publish_queued", AsyncMock()),
        patch("app.routers.documents.DocumentResponse.model_validate", MagicMock(return_value=fake_response)),
    ):
        await replace_document(
            project_id=old_doc.project_id,
            doc_id=old_doc.id,
            file=_upload_file(),
            dry_run=False,
            db=db,
            current_user=MagicMock(id=uuid.uuid4()),
            _member=MagicMock(),
        )

    # Old doc archived
    assert old_doc.archived_at is not None
    # New doc has FK pointing to old doc
    assert saved_new_doc is not None
    assert saved_new_doc.replaces_document_id == old_doc.id
    # Pipeline enqueued for new doc
    enqueue_mock.assert_awaited_once()
    # Qdrant vectors cleaned up for old doc
    qdrant_delete.assert_awaited_once()
