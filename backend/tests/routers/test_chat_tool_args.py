"""Verify Pydantic arg models for chat tools."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.routers.chat_tools import TOOL_ARG_MODELS


def test_known_tools_have_models() -> None:
    expected = {
        "list_documents",
        "get_current_state",
        "get_state_history",
        "search_documents",
        "get_document_content",
        "update_task_status",
    }
    assert set(TOOL_ARG_MODELS.keys()) == expected


def test_list_documents_accepts_empty_dict() -> None:
    m = TOOL_ARG_MODELS["list_documents"].model_validate({})
    assert m.model_dump() == {}


def test_list_documents_rejects_extra_keys() -> None:
    with pytest.raises(ValidationError):
        TOOL_ARG_MODELS["list_documents"].model_validate({"foo": "bar"})


def test_search_documents_requires_query() -> None:
    with pytest.raises(ValidationError):
        TOOL_ARG_MODELS["search_documents"].model_validate({"limit": 5})


def test_search_documents_rejects_empty_query() -> None:
    with pytest.raises(ValidationError):
        TOOL_ARG_MODELS["search_documents"].model_validate({"query": ""})


def test_search_documents_limit_bounds() -> None:
    M = TOOL_ARG_MODELS["search_documents"]
    M.model_validate({"query": "hello", "limit": 10})
    with pytest.raises(ValidationError):
        M.model_validate({"query": "hello", "limit": 11})
    with pytest.raises(ValidationError):
        M.model_validate({"query": "hello", "limit": 0})


def test_search_documents_accepts_null_limit() -> None:
    m = TOOL_ARG_MODELS["search_documents"].model_validate({"query": "hello", "limit": None})
    assert m.query == "hello"
    assert m.limit is None


def test_get_state_history_limit_bounds() -> None:
    M = TOOL_ARG_MODELS["get_state_history"]
    M.model_validate({"limit": 50})
    M.model_validate({"limit": None})
    with pytest.raises(ValidationError):
        M.model_validate({"limit": 51})


def test_update_task_status_rejects_invalid_status() -> None:
    with pytest.raises(ValidationError):
        TOOL_ARG_MODELS["update_task_status"].model_validate(
            {"task_id": "t1", "status": "in-progress"}
        )


def test_update_task_status_requires_both_fields() -> None:
    M = TOOL_ARG_MODELS["update_task_status"]
    with pytest.raises(ValidationError):
        M.model_validate({"task_id": "t1"})
    with pytest.raises(ValidationError):
        M.model_validate({"status": "done"})


def test_get_document_content_requires_id() -> None:
    M = TOOL_ARG_MODELS["get_document_content"]
    M.model_validate({"document_id": "abc"})
    with pytest.raises(ValidationError):
        M.model_validate({"document_id": ""})
    with pytest.raises(ValidationError):
        M.model_validate({})
