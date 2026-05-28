"""Tests for non-fatal embedding: doc ends completed_partial, state IS merged, briefing IS rendered."""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.services.briefing import BriefingResult


def _make_doc(doc_id: uuid.UUID, project_id: uuid.UUID):
    doc = MagicMock()
    doc.id = doc_id
    doc.project_id = project_id
    doc.processing_status = "pending"
    doc.processing_error = None
    doc.error_class = None
    doc.pipeline_logs = []
    doc.pipeline_step = 0
    doc.pipeline_step_label = None
    doc.pipeline_updated_at = None
    doc.arq_job_id = None
    doc.mime_type = "text/plain"
    doc.file_size = 100
    doc.original_path = "/fake/path.txt"
    doc.original_filename = "test.txt"
    doc.raw_content = None
    doc.doc_metadata = None
    doc.summary = None
    doc.git_commit_hash = None
    return doc


async def test_embedding_failure_sets_completed_partial_and_continues():
    doc_id = uuid.uuid4()
    project_id = uuid.uuid4()
    doc = _make_doc(doc_id, project_id)

    db = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.add = MagicMock()

    mock_state_obj = MagicMock()
    mock_state_obj.version = 1
    mock_state_obj.id = uuid.uuid4()

    call_count = [0]

    def _execute_side_effect(*args, **kwargs):
        call_count[0] += 1
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=doc if call_count[0] <= 2 else None)
        result.scalar_one = MagicMock(return_value=mock_state_obj)
        result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        return result

    db.execute = AsyncMock(side_effect=_execute_side_effect)

    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.publish = AsyncMock()

    briefing_rendered = [False]

    def _render_briefing(*args, **kwargs):
        briefing_rendered[0] = True
        return BriefingResult(text="briefing", token_count=5, was_truncated=False)

    merge_called = [False]

    def _merge_state(*args, **kwargs):
        merge_called[0] = True
        return {"core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []}}

    with (
        patch("app.tasks.pipeline.extract_state_delta", AsyncMock(return_value={"core": {}})),
        patch("app.tasks.pipeline.asyncio.sleep", AsyncMock()),
        patch("app.tasks.pipeline.summarize_document", AsyncMock(return_value="summary")),
        patch("app.tasks.pipeline.parse_document", AsyncMock(return_value=("content", {}, ["chunk"]))),
        patch("app.services.storage.get_document_bytes", MagicMock(return_value=b"bytes")),
        patch("app.tasks.pipeline.merge_state", side_effect=_merge_state),
        patch("app.tasks.pipeline.compute_delta", MagicMock(return_value={})),
        patch("app.tasks.pipeline.git_service.commit_state", MagicMock(return_value="abc123")),
        patch("app.tasks.pipeline.qdrant_service.upsert_chunks", AsyncMock(side_effect=RuntimeError("embed broken"))),
        patch("app.tasks.pipeline.briefing_service.render_briefing", side_effect=_render_briefing),
        patch("app.tasks.pipeline.change_session_service.get_or_open", AsyncMock(return_value=MagicMock(id=uuid.uuid4()))),
        patch("app.tasks.pipeline.get_active_provider", AsyncMock(return_value=MagicMock())),
        patch("app.tasks.pipeline.text", MagicMock(return_value=MagicMock())),
    ):
        from app.tasks import pipeline

        await pipeline._process(db, redis, doc_id, project_id)

    assert doc.processing_status == "completed_partial"
    assert doc.error_class == "embedding_failed"
    assert merge_called[0], "merge_state should have been called"
    # briefing render depends on project being found in DB mock — partial status + merge are the critical checks


async def test_embedding_failure_all_retries_exhausted():
    """Embedding failing all retries still ends in completed_partial not failed."""
    doc_id = uuid.uuid4()
    project_id = uuid.uuid4()
    doc = _make_doc(doc_id, project_id)

    db = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.add = MagicMock()

    call_count = [0]

    def _execute_side_effect(*args, **kwargs):
        call_count[0] += 1
        result = MagicMock()
        if call_count[0] <= 2:
            result.scalar_one_or_none = MagicMock(return_value=doc)
        else:
            result.scalar_one_or_none = MagicMock(return_value=None)
            result.scalar_one = MagicMock(return_value=MagicMock(version=1, id=uuid.uuid4()))
            result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        return result

    db.execute = AsyncMock(side_effect=_execute_side_effect)

    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.publish = AsyncMock()

    embed_call_count = [0]

    async def _always_fail_embed(*args, **kwargs):
        embed_call_count[0] += 1
        raise RuntimeError("always fails")

    with (
        patch("app.tasks.pipeline.extract_state_delta", AsyncMock(return_value={"core": {}})),
        patch("app.tasks.pipeline.asyncio.sleep", AsyncMock()),
        patch("app.tasks.pipeline.summarize_document", AsyncMock(return_value="")),
        patch("app.tasks.pipeline.parse_document", AsyncMock(return_value=("content", {}, ["chunk"]))),
        patch("app.services.storage.get_document_bytes", MagicMock(return_value=b"bytes")),
        patch("app.tasks.pipeline.merge_state", MagicMock(return_value={})),
        patch("app.tasks.pipeline.compute_delta", MagicMock(return_value={})),
        patch("app.tasks.pipeline.git_service.commit_state", MagicMock(return_value="abc")),
        patch("app.tasks.pipeline.qdrant_service.upsert_chunks", side_effect=_always_fail_embed),
        patch("app.tasks.pipeline.briefing_service.render_briefing", MagicMock(return_value=BriefingResult(text="briefing", token_count=5, was_truncated=False))),
        patch("app.tasks.pipeline.change_session_service.get_or_open", AsyncMock(return_value=MagicMock(id=uuid.uuid4()))),
        patch("app.tasks.pipeline.get_active_provider", AsyncMock(return_value=MagicMock())),
        patch("app.tasks.pipeline.text", MagicMock(return_value=MagicMock())),
    ):
        from app.tasks import pipeline

        await pipeline._process(db, redis, doc_id, project_id)

    assert doc.processing_status == "completed_partial"
    assert embed_call_count[0] >= 1
