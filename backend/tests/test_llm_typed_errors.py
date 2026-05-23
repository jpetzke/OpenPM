"""Tests for LLM typed exception hierarchy and fallback chain."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from openai import APIStatusError, APITimeoutError, RateLimitError

from app.services.llm import (
    LLMError,
    LLMRateLimit,
    LLMServerError,
    LLMTimeout,
    _wrap_openai_exc,
)


def _make_api_status_error(status_code: int) -> APIStatusError:
    response = MagicMock()
    response.status_code = status_code
    return APIStatusError("err", response=response, body={})


def test_wrap_rate_limit():
    exc = RateLimitError("too many", response=MagicMock(status_code=429), body={})
    result = _wrap_openai_exc(exc)
    assert isinstance(result, LLMRateLimit)
    assert isinstance(result, LLMError)
    assert result.__cause__ is exc


def test_wrap_timeout():
    exc = APITimeoutError.__new__(APITimeoutError)
    exc.args = ("timeout",)
    result = _wrap_openai_exc(exc)
    assert isinstance(result, LLMTimeout)
    assert isinstance(result, LLMError)


def test_wrap_5xx():
    exc = _make_api_status_error(503)
    result = _wrap_openai_exc(exc)
    assert isinstance(result, LLMServerError)
    assert isinstance(result, LLMError)


def test_wrap_5xx_500():
    exc = _make_api_status_error(500)
    result = _wrap_openai_exc(exc)
    assert isinstance(result, LLMServerError)


def test_wrap_4xx_passthrough():
    exc = _make_api_status_error(400)
    result = _wrap_openai_exc(exc)
    assert result is exc


def test_wrap_unknown_passthrough():
    exc = ValueError("something else")
    result = _wrap_openai_exc(exc)
    assert result is exc


async def test_complete_raises_llm_rate_limit_after_all_candidates_exhausted():
    rate_err = RateLimitError("rate limited", response=MagicMock(status_code=429), body={})

    mock_provider = MagicMock()
    mock_client = MagicMock()
    mock_client.chat = MagicMock()
    mock_client.chat.completions = MagicMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=rate_err)

    with (
        patch("app.services.llm.require_active_provider", AsyncMock(return_value=mock_provider)),
        patch("app.services.llm.build_llm_client", return_value=mock_client),
        patch("app.services.llm.candidate_models", return_value=["model-a", "model-b"]),
    ):
        from app.services.llm import complete

        with pytest.raises(LLMRateLimit):
            await complete([{"role": "user", "content": "hi"}])

    assert mock_client.chat.completions.create.await_count == 2


async def test_complete_falls_back_to_next_model_on_rate_limit():
    rate_err = RateLimitError("rate limited", response=MagicMock(status_code=429), body={})

    good_response = MagicMock()
    good_response.choices = [MagicMock(finish_reason="stop")]

    call_count = 0

    async def _side_effect(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise rate_err
        return good_response

    mock_provider = MagicMock()
    mock_client = MagicMock()
    mock_client.chat = MagicMock()
    mock_client.chat.completions = MagicMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=_side_effect)

    with (
        patch("app.services.llm.require_active_provider", AsyncMock(return_value=mock_provider)),
        patch("app.services.llm.build_llm_client", return_value=mock_client),
        patch("app.services.llm.candidate_models", return_value=["model-a", "model-b"]),
    ):
        from app.services.llm import complete

        result = await complete([{"role": "user", "content": "hi"}])

    assert result is good_response
    assert call_count == 2


async def test_complete_raises_llm_server_error_for_5xx():
    server_err = _make_api_status_error(502)

    mock_provider = MagicMock()
    mock_client = MagicMock()
    mock_client.chat = MagicMock()
    mock_client.chat.completions = MagicMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=server_err)

    with (
        patch("app.services.llm.require_active_provider", AsyncMock(return_value=mock_provider)),
        patch("app.services.llm.build_llm_client", return_value=mock_client),
        patch("app.services.llm.candidate_models", return_value=["model-a"]),
    ):
        from app.services.llm import complete

        with pytest.raises(LLMServerError):
            await complete([{"role": "user", "content": "hi"}])


async def test_complete_raises_llm_timeout():
    timeout_err = APITimeoutError.__new__(APITimeoutError)
    timeout_err.args = ("Request timed out",)

    mock_provider = MagicMock()
    mock_client = MagicMock()
    mock_client.chat = MagicMock()
    mock_client.chat.completions = MagicMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=timeout_err)

    with (
        patch("app.services.llm.require_active_provider", AsyncMock(return_value=mock_provider)),
        patch("app.services.llm.build_llm_client", return_value=mock_client),
        patch("app.services.llm.candidate_models", return_value=["model-a"]),
    ):
        from app.services.llm import complete

        with pytest.raises(LLMTimeout):
            await complete([{"role": "user", "content": "hi"}])
