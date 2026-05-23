"""Tests for JSON re-prompt with schema injection in extraction.py."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.llm import LLMInvalidJSON


def _mock_response(content: str):
    resp = MagicMock()
    resp.choices = [MagicMock()]
    resp.choices[0].message.content = content
    return resp


VALID_DELTA = '{"core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []}, "custom": {}}'
INVALID_JSON = "not { valid } json {"


async def test_first_bad_second_valid_succeeds():
    call_count = [0]

    async def _llm_complete(messages, purpose=None, **kwargs):
        call_count[0] += 1
        if call_count[0] == 1:
            return _mock_response(INVALID_JSON)
        return _mock_response(VALID_DELTA)

    with patch("app.services.extraction.llm_service.complete", side_effect=_llm_complete):
        from app.services.extraction import extract_state_delta

        result = await extract_state_delta("some doc content", None)

    assert call_count[0] == 2
    assert isinstance(result, dict)
    assert "core" in result


async def test_both_bad_raises_llm_invalid_json():
    async def _llm_complete(messages, purpose=None, **kwargs):
        return _mock_response(INVALID_JSON)

    with patch("app.services.extraction.llm_service.complete", side_effect=_llm_complete):
        from app.services.extraction import extract_state_delta

        with pytest.raises(LLMInvalidJSON):
            await extract_state_delta("some doc content", None)


async def test_first_valid_no_reprompt():
    call_count = [0]

    async def _llm_complete(messages, purpose=None, **kwargs):
        call_count[0] += 1
        return _mock_response(VALID_DELTA)

    with patch("app.services.extraction.llm_service.complete", side_effect=_llm_complete):
        from app.services.extraction import extract_state_delta

        result = await extract_state_delta("some doc content", None)

    assert call_count[0] == 1
    assert isinstance(result, dict)


async def test_reprompt_includes_schema_in_system():
    captured_messages = []
    call_count = [0]

    async def _llm_complete(messages, purpose=None, **kwargs):
        captured_messages.append(messages)
        call_count[0] += 1
        if call_count[0] == 1:
            return _mock_response(INVALID_JSON)
        return _mock_response(VALID_DELTA)

    with patch("app.services.extraction.llm_service.complete", side_effect=_llm_complete):
        from app.services.extraction import extract_state_delta

        await extract_state_delta("doc", None)

    assert call_count[0] == 2
    second_call_messages = captured_messages[1]
    system_msg = next(m for m in second_call_messages if m["role"] == "system")
    assert "Return only valid JSON matching this schema" in system_msg["content"]
    assert "ExtractedDelta" in system_msg["content"]
