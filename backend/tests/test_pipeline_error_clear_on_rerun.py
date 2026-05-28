"""Tests that error_class and processing_error are cleared at pipeline run start."""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.services.briefing import BriefingResult


def _make_doc_with_errors(doc_id: uuid.UUID, project_id: uuid.UUID):
    doc = MagicMock()
    doc.id = doc_id
    doc.project_id = project_id
    doc.processing_status = "failed"
    doc.processing_error = "previous error message"
    doc.error_class = "llm_rate_limit"
    doc.pipeline_logs = []
    doc.pipeline_step = 3
    doc.pipeline_step_label = "summarize_extract"
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


async def test_error_fields_cleared_at_run_start():
    doc_id = uuid.uuid4()
    project_id = uuid.uuid4()
    doc = _make_doc_with_errors(doc_id, project_id)

    cleared_at_start = {}

    db = AsyncMock()
    db.flush = AsyncMock()
    db.rollback = AsyncMock()
    db.add = MagicMock()

    commit_call = [0]

    async def _commit():
        commit_call[0] += 1
        if commit_call[0] == 1:
            # This is the first commit right after setting processing = processing
            cleared_at_start["error_class"] = doc.error_class
            cleared_at_start["processing_error"] = doc.processing_error

    db.commit = AsyncMock(side_effect=_commit)

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

    with (
        patch("app.tasks.pipeline.extract_state_delta", AsyncMock(return_value=({"core": {}}, []))),
        patch("app.tasks.pipeline.asyncio.sleep", AsyncMock()),
        patch("app.tasks.pipeline.summarize_document", AsyncMock(return_value=("", None))),
        patch("app.tasks.pipeline.parse_document", AsyncMock(return_value=("content", {}, ["chunk"]))),
        patch("app.services.storage.get_document_bytes", MagicMock(return_value=b"bytes")),
        patch("app.tasks.pipeline.merge_state", MagicMock(return_value={})),
        patch("app.tasks.pipeline.compute_delta", MagicMock(return_value={})),
        patch("app.tasks.pipeline.git_service.commit_state", MagicMock(return_value="abc")),
        patch("app.tasks.pipeline.qdrant_service.upsert_chunks", AsyncMock()),
        patch("app.tasks.pipeline.briefing_service.render_briefing", MagicMock(return_value=BriefingResult(text="briefing", token_count=5, was_truncated=False))),
        patch("app.tasks.pipeline.change_session_service.get_or_open", AsyncMock(return_value=MagicMock(id=uuid.uuid4()))),
        patch("app.tasks.pipeline.get_active_provider", AsyncMock(return_value=MagicMock())),
        patch("app.tasks.pipeline.text", MagicMock(return_value=MagicMock())),
    ):
        from app.tasks import pipeline

        await pipeline._process(db, redis, doc_id, project_id)

    assert cleared_at_start.get("error_class") is None, "error_class must be cleared at run start"
    assert cleared_at_start.get("processing_error") is None, "processing_error must be cleared at run start"


async def test_happy_path_ends_done_with_no_error():
    doc_id = uuid.uuid4()
    project_id = uuid.uuid4()
    doc = _make_doc_with_errors(doc_id, project_id)

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

    with (
        patch("app.tasks.pipeline.extract_state_delta", AsyncMock(return_value=({"core": {}}, []))),
        patch("app.tasks.pipeline.asyncio.sleep", AsyncMock()),
        patch("app.tasks.pipeline.summarize_document", AsyncMock(return_value=("", None))),
        patch("app.tasks.pipeline.parse_document", AsyncMock(return_value=("content", {}, ["chunk"]))),
        patch("app.services.storage.get_document_bytes", MagicMock(return_value=b"bytes")),
        patch("app.tasks.pipeline.merge_state", MagicMock(return_value={})),
        patch("app.tasks.pipeline.compute_delta", MagicMock(return_value={})),
        patch("app.tasks.pipeline.git_service.commit_state", MagicMock(return_value="abc")),
        patch("app.tasks.pipeline.qdrant_service.upsert_chunks", AsyncMock()),
        patch("app.tasks.pipeline.briefing_service.render_briefing", MagicMock(return_value=BriefingResult(text="briefing", token_count=5, was_truncated=False))),
        patch("app.tasks.pipeline.change_session_service.get_or_open", AsyncMock(return_value=MagicMock(id=uuid.uuid4()))),
        patch("app.tasks.pipeline.get_active_provider", AsyncMock(return_value=MagicMock())),
        patch("app.tasks.pipeline.text", MagicMock(return_value=MagicMock())),
    ):
        from app.tasks import pipeline

        await pipeline._process(db, redis, doc_id, project_id)

    assert doc.processing_status == "done"
    assert doc.error_class is None
    assert doc.processing_error is None
