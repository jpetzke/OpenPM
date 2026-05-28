"""Tests for llm.complete() usage return shape (Section K)."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.llm import UsageRecord, complete


def _make_response(content: str, prompt_tokens: int = 100, completion_tokens: int = 50):
    """Build a mock OpenAI response with usage data."""
    usage = SimpleNamespace(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )
    response = MagicMock()
    response.choices = [MagicMock()]
    response.choices[0].message.content = content
    response.choices[0].finish_reason = "stop"
    response.usage = usage
    return response


async def test_complete_returns_usage_record_for_known_model():
    """complete() should return a UsageRecord with cost computed for known model."""
    mock_response = _make_response("Hello", prompt_tokens=200, completion_tokens=80)

    with (
        patch("app.services.llm.require_active_provider", AsyncMock(return_value=MagicMock())),
        patch("app.services.llm.build_llm_client", return_value=MagicMock(
            chat=MagicMock(
                completions=MagicMock(
                    create=AsyncMock(return_value=mock_response)
                )
            )
        )),
        patch("app.services.llm.candidate_models", return_value=["openai/gpt-4o"]),
    ):
        response, usage = await complete([{"role": "user", "content": "hi"}])

    assert usage is not None
    assert usage["prompt_tokens"] == 200
    assert usage["completion_tokens"] == 80
    assert usage["model"] == "openai/gpt-4o"
    assert usage["cost_usd"] > 0
    # Verify the cost is correctly computed for gpt-4o
    expected_cost = (200 / 1000) * 0.0025 + (80 / 1000) * 0.01
    assert abs(usage["cost_usd"] - expected_cost) < 1e-9


async def test_complete_returns_none_usage_when_no_usage_data():
    """complete() should return None usage when provider doesn't report usage."""
    mock_response = _make_response("Hello")
    mock_response.usage = None

    with (
        patch("app.services.llm.require_active_provider", AsyncMock(return_value=MagicMock())),
        patch("app.services.llm.build_llm_client", return_value=MagicMock(
            chat=MagicMock(
                completions=MagicMock(
                    create=AsyncMock(return_value=mock_response)
                )
            )
        )),
        patch("app.services.llm.candidate_models", return_value=["openai/gpt-4o"]),
    ):
        response, usage = await complete([{"role": "user", "content": "hi"}])

    assert usage is None


async def test_complete_usage_for_unknown_model_uses_fallback():
    """complete() uses fallback pricing for models not in PRICING dict."""
    mock_response = _make_response("Hello", prompt_tokens=1000, completion_tokens=500)

    with (
        patch("app.services.llm.require_active_provider", AsyncMock(return_value=MagicMock())),
        patch("app.services.llm.build_llm_client", return_value=MagicMock(
            chat=MagicMock(
                completions=MagicMock(
                    create=AsyncMock(return_value=mock_response)
                )
            )
        )),
        patch("app.services.llm.candidate_models", return_value=["unknown/new-model-v99"]),
    ):
        response, usage = await complete([{"role": "user", "content": "hi"}])

    assert usage is not None
    assert usage["model"] == "unknown/new-model-v99"
    # Should have used fallback pricing
    from app.agent_config import FALLBACK_PRICING
    expected_cost = (1000 / 1000) * FALLBACK_PRICING["input"] + (500 / 1000) * FALLBACK_PRICING["output"]
    assert abs(usage["cost_usd"] - expected_cost) < 1e-9


async def test_complete_response_content_still_accessible():
    """Ensure the response object is still the first tuple element and content is readable."""
    mock_response = _make_response("The answer is 42")

    with (
        patch("app.services.llm.require_active_provider", AsyncMock(return_value=MagicMock())),
        patch("app.services.llm.build_llm_client", return_value=MagicMock(
            chat=MagicMock(
                completions=MagicMock(
                    create=AsyncMock(return_value=mock_response)
                )
            )
        )),
        patch("app.services.llm.candidate_models", return_value=["openai/gpt-4o"]),
    ):
        response, usage = await complete([{"role": "user", "content": "What is the answer?"}])

    assert response.choices[0].message.content == "The answer is 42"
