"""Tests for required-confidence validation + re-prompt in extraction."""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services import extraction


def _mk_response(payload: dict | str) -> tuple:
    """Build a fake (response, usage) tuple matching the new complete() return shape."""
    content = payload if isinstance(payload, str) else json.dumps(payload)
    resp = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )
    return resp, None  # no usage in mocked responses


async def test_no_reprompt_when_all_items_have_confidence():
    delta = {
        "core": {
            "open_tasks": [
                {"id": "t1", "title": "Task A", "confidence": "high"},
            ],
            "contacts": [],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
    }

    complete_mock = AsyncMock(return_value=_mk_response(delta))
    with patch("app.services.extraction.llm_service.complete", complete_mock):
        result, _usage = await extraction.extract_state_delta("doc text", current_state=None)

    assert complete_mock.await_count == 1, "no reprompt expected"
    assert result["core"]["open_tasks"][0]["confidence"] == "high"


async def test_reprompt_when_item_missing_confidence_succeeds_on_retry():
    first = {
        "core": {
            "open_tasks": [
                {"id": "t1", "title": "Task A"},  # missing confidence
            ],
            "contacts": [],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
    }
    retry = {
        "core": {
            "open_tasks": [
                {"id": "t1", "title": "Task A", "confidence": "medium"},
            ],
            "contacts": [],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
    }
    complete_mock = AsyncMock(side_effect=[_mk_response(first), _mk_response(retry)])
    with patch("app.services.extraction.llm_service.complete", complete_mock):
        result, _usage = await extraction.extract_state_delta("doc text", current_state=None)

    assert complete_mock.await_count == 2, "reprompt expected exactly once"
    assert result["core"]["open_tasks"][0]["confidence"] == "medium"


async def test_reprompt_uses_strict_system_message():
    """Re-prompt should send the strict re-prompt system message."""
    first = {
        "core": {
            "deadlines": [{"id": "d1", "title": "Launch", "date": "2026-06-01"}],
            "open_tasks": [],
            "contacts": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
    }
    retry = {
        "core": {
            "deadlines": [{"id": "d1", "title": "Launch", "date": "2026-06-01", "confidence": "low"}],
            "open_tasks": [],
            "contacts": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
    }
    complete_mock = AsyncMock(side_effect=[_mk_response(first), _mk_response(retry)])
    with patch("app.services.extraction.llm_service.complete", complete_mock):
        await extraction.extract_state_delta("doc", None)

    # Second call's messages should start with the strict system msg.
    second_call_messages = complete_mock.await_args_list[1].args[0]
    assert second_call_messages[0]["role"] == "system"
    assert "Letzter Versuch war ungültig" in second_call_messages[0]["content"]


async def test_reprompt_failure_falls_back_to_normalised_default():
    """When the retry also lacks confidence, the tolerant normaliser fills "high"."""
    first = {
        "core": {
            "open_tasks": [{"id": "t1", "title": "Task"}],  # missing
            "contacts": [], "deadlines": [], "decisions": [], "blockers": [],
        },
        "dynamic_sections": [],
    }
    retry = {
        "core": {
            "open_tasks": [{"id": "t1", "title": "Task"}],  # still missing
            "contacts": [], "deadlines": [], "decisions": [], "blockers": [],
        },
        "dynamic_sections": [],
    }
    complete_mock = AsyncMock(side_effect=[_mk_response(first), _mk_response(retry)])
    with patch("app.services.extraction.llm_service.complete", complete_mock):
        result, _usage = await extraction.extract_state_delta("doc", None)

    assert complete_mock.await_count == 2
    # Final fallback normalisation injects "high".
    assert result["core"]["open_tasks"][0]["confidence"] == "high"


async def test_reprompt_when_dynamic_section_item_missing_confidence():
    first = {
        "core": {"open_tasks": [], "contacts": [], "deadlines": [], "decisions": [], "blockers": []},
        "dynamic_sections": [
            {
                "title": "Risks",
                "kind": "risks",
                "items": [{"title": "Risk A"}],  # missing
            }
        ],
    }
    retry = {
        "core": {"open_tasks": [], "contacts": [], "deadlines": [], "decisions": [], "blockers": []},
        "dynamic_sections": [
            {
                "title": "Risks",
                "kind": "risks",
                "items": [{"title": "Risk A", "confidence": "low"}],
            }
        ],
    }
    complete_mock = AsyncMock(side_effect=[_mk_response(first), _mk_response(retry)])
    with patch("app.services.extraction.llm_service.complete", complete_mock):
        result, _usage = await extraction.extract_state_delta("doc", None)

    assert complete_mock.await_count == 2
    assert result["dynamic_sections"][0]["items"][0]["confidence"] == "low"


async def test_invalid_confidence_value_triggers_reprompt():
    """Confidence "very-high" is not in the allowed set → reprompt."""
    first = {
        "core": {
            "open_tasks": [{"id": "t1", "title": "Task", "confidence": "very-high"}],
            "contacts": [], "deadlines": [], "decisions": [], "blockers": [],
        },
        "dynamic_sections": [],
    }
    retry = {
        "core": {
            "open_tasks": [{"id": "t1", "title": "Task", "confidence": "high"}],
            "contacts": [], "deadlines": [], "decisions": [], "blockers": [],
        },
        "dynamic_sections": [],
    }
    complete_mock = AsyncMock(side_effect=[_mk_response(first), _mk_response(retry)])
    with patch("app.services.extraction.llm_service.complete", complete_mock):
        result, _usage = await extraction.extract_state_delta("doc", None)

    assert complete_mock.await_count == 2
    assert result["core"]["open_tasks"][0]["confidence"] == "high"
