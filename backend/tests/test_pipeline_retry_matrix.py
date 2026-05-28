"""Tests for per-step retry matrix in pipeline._step_with_retry and extract flow."""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.llm import LLMRateLimit, LLMServerError, LLMTimeout
from app.tasks.pipeline import _RETRY_MATRIX, _step_with_retry
from app.services.briefing import BriefingResult


async def test_step_with_retry_succeeds_on_first():
    fn = AsyncMock(return_value="ok")
    result = await _step_with_retry("test", fn, error_class="x", max_tries=3, backoffs=[1.0, 2.0])
    assert result == "ok"
    assert fn.await_count == 1


async def test_step_with_retry_retries_and_succeeds():
    call_count = 0

    async def fn():
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise RuntimeError("fail")
        return "success"

    sleep_mock = AsyncMock()
    with patch("app.tasks.pipeline.asyncio.sleep", sleep_mock):
        result = await _step_with_retry("test", fn, error_class="x", max_tries=3, backoffs=[1.0, 2.0])

    assert result == "success"
    assert call_count == 3
    assert sleep_mock.await_count == 2
    sleep_mock.assert_any_await(1.0)
    sleep_mock.assert_any_await(2.0)


async def test_step_with_retry_raises_after_max_tries():
    fn = AsyncMock(side_effect=RuntimeError("always fails"))
    sleep_mock = AsyncMock()
    with patch("app.tasks.pipeline.asyncio.sleep", sleep_mock):
        with pytest.raises(RuntimeError, match="always fails"):
            await _step_with_retry("test", fn, error_class="x", max_tries=3, backoffs=[1.0, 2.0])

    assert fn.await_count == 3
    assert sleep_mock.await_count == 2


def test_retry_matrix_rate_limit_shape():
    max_tries, backoffs = _RETRY_MATRIX["llm_rate_limit"]
    assert max_tries == 5
    assert len(backoffs) == 4


def test_retry_matrix_timeout_shape():
    max_tries, backoffs = _RETRY_MATRIX["llm_timeout"]
    assert max_tries == 3
    assert len(backoffs) == 2


def test_retry_matrix_5xx_shape():
    max_tries, backoffs = _RETRY_MATRIX["llm_5xx"]
    assert max_tries == 3
    assert len(backoffs) == 2


def test_retry_matrix_embedding_shape():
    max_tries, backoffs = _RETRY_MATRIX["embedding_failed"]
    assert max_tries == 3
    assert len(backoffs) == 2


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


async def _run_pipeline_with_llm_error(llm_exc_factory, expected_error_class: str, n_raises: int):
    """Helper: run the full _process pipeline with LLM raising n_raises times."""
    doc_id = uuid.uuid4()
    project_id = uuid.uuid4()
    doc = _make_doc(doc_id, project_id)

    db = AsyncMock()
    db.execute = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.add = MagicMock()

    # Make db.execute return objects with scalar_one_or_none for doc lookup
    scalar_result_doc = MagicMock()
    scalar_result_doc.scalar_one_or_none = MagicMock(return_value=doc)
    scalar_result_state = MagicMock()
    scalar_result_state.scalar_one_or_none = MagicMock(return_value=None)

    call_count = [0]

    def _execute_side_effect(*args, **kwargs):
        call_count[0] += 1
        if call_count[0] <= 2:
            return scalar_result_doc
        return scalar_result_state

    db.execute = AsyncMock(side_effect=_execute_side_effect)

    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.publish = AsyncMock()

    call_count_extract = [0]

    async def _mock_extract(*args, **kwargs):
        call_count_extract[0] += 1
        if call_count_extract[0] <= n_raises:
            raise llm_exc_factory()
        return {"core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []}}

    sleep_calls = []

    async def _mock_sleep(s):
        sleep_calls.append(s)

    with (
        patch("app.tasks.pipeline.extract_state_delta", side_effect=_mock_extract),
        patch("app.tasks.pipeline.asyncio.sleep", side_effect=_mock_sleep),
        patch("app.tasks.pipeline.summarize_document", AsyncMock(return_value="")),
        patch("app.tasks.pipeline.parse_document", AsyncMock(return_value=("content", {}, ["chunk1"]))),
        patch("app.services.storage.get_document_bytes", MagicMock(return_value=b"bytes")),
        patch("app.tasks.pipeline.merge_state", MagicMock(return_value={})),
        patch("app.tasks.pipeline.compute_delta", MagicMock(return_value={})),
        patch("app.tasks.pipeline.git_service.commit_state", MagicMock(return_value="abc")),
        patch("app.tasks.pipeline.qdrant_service.upsert_chunks", AsyncMock()),
        patch("app.tasks.pipeline.briefing_service.render_briefing", MagicMock(return_value=BriefingResult(text="briefing", token_count=5, was_truncated=False))),
        patch("app.tasks.pipeline.change_session_service.get_or_open", AsyncMock(return_value=MagicMock(id=uuid.uuid4()))),
        patch("app.tasks.pipeline.get_active_provider", AsyncMock(return_value=MagicMock())),
        patch("app.tasks.pipeline.async_session_factory", MagicMock()),
        patch("app.services.storage.get_document_bytes", MagicMock(return_value=b"bytes")),
        # text() for advisory lock
        patch("app.tasks.pipeline.text", MagicMock(return_value=MagicMock())),
    ):
        from app.tasks import pipeline

        try:
            await pipeline._process(db, redis, doc_id, project_id)
        except Exception:
            pass

    return doc, sleep_calls, call_count_extract[0]


async def test_extract_retries_on_llm_rate_limit_then_succeeds():
    max_tries, backoffs = _RETRY_MATRIX["llm_rate_limit"]

    def _exc():
        return LLMRateLimit("rate limited")

    # n_raises=2: first call (initial try) raises, retry-attempt-0 raises, attempt-1 succeeds.
    # That means 3 total calls to extract_fn, 1 sleep between attempts 0 and 1.
    doc, sleep_calls, total_extract_calls = await _run_pipeline_with_llm_error(_exc, "llm_rate_limit", n_raises=2)

    assert total_extract_calls >= 3
    assert len(sleep_calls) >= 1
    assert sleep_calls[0] == backoffs[0]


async def test_extract_all_retries_exhausted_llm_rate_limit():
    max_tries, backoffs = _RETRY_MATRIX["llm_rate_limit"]

    def _exc():
        return LLMRateLimit("rate limited")

    doc, sleep_calls, total_extract_calls = await _run_pipeline_with_llm_error(
        _exc, "llm_rate_limit", n_raises=max_tries + 10
    )

    assert doc.processing_status == "failed"
    assert doc.error_class == "llm_rate_limit"


async def test_extract_all_retries_exhausted_llm_timeout():
    max_tries, backoffs = _RETRY_MATRIX["llm_timeout"]

    def _exc():
        return LLMTimeout("timeout")

    doc, sleep_calls, total_extract_calls = await _run_pipeline_with_llm_error(
        _exc, "llm_timeout", n_raises=max_tries + 10
    )

    assert doc.processing_status == "failed"
    assert doc.error_class == "llm_timeout"


async def test_extract_all_retries_exhausted_llm_server_error():
    max_tries, backoffs = _RETRY_MATRIX["llm_5xx"]

    def _exc():
        return LLMServerError("500 error")

    doc, sleep_calls, total_extract_calls = await _run_pipeline_with_llm_error(
        _exc, "llm_5xx", n_raises=max_tries + 10
    )

    assert doc.processing_status == "failed"
    assert doc.error_class == "llm_5xx"
