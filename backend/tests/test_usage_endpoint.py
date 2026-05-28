"""Tests for GET /api/projects/{id}/usage endpoint (Section K).

Uses mocked SQLAlchemy session consistent with the project's testing convention.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.routers.usage import _aggregate_usage, _period_start, get_usage


# ---------------------------------------------------------------------------
# Unit tests for helper functions
# ---------------------------------------------------------------------------

def test_period_start_7d():
    since = _period_start("7d")
    now = datetime.now(timezone.utc)
    delta = now - since
    assert 6 < delta.days <= 7


def test_period_start_mtd_is_first_of_month():
    since = _period_start("mtd")
    assert since.day == 1
    assert since.hour == 0


def test_period_start_today_is_midnight():
    since = _period_start("today")
    assert since.hour == 0
    assert since.minute == 0


def test_aggregate_usage_totals():
    records = [
        {"date": "2026-05-28", "model": "openai/gpt-4o", "purpose": "chat", "prompt": 200, "completion": 80, "cost_usd": 0.005},
        {"date": "2026-05-28", "model": "openai/gpt-4o", "purpose": "extraction", "prompt": 600, "completion": 150, "cost_usd": 0.003},
    ]
    result = _aggregate_usage(records)
    assert result["total"]["prompt"] == 800
    assert result["total"]["completion"] == 230
    assert abs(result["total"]["cost_usd"] - 0.008) < 1e-6
    assert len(result["daily"]) == 1
    assert result["daily"][0]["date"] == "2026-05-28"
    assert len(result["by_model"]) == 1
    assert result["by_model"][0]["model"] == "openai/gpt-4o"
    assert len(result["by_purpose"]) == 2


def test_aggregate_usage_empty():
    result = _aggregate_usage([])
    assert result["total"]["prompt"] == 0
    assert result["total"]["cost_usd"] == 0.0
    assert result["daily"] == []
    assert result["by_model"] == []
    assert result["by_purpose"] == []


def test_aggregate_usage_multiple_models():
    records = [
        {"date": "2026-05-28", "model": "openai/gpt-4o", "purpose": "chat", "prompt": 100, "completion": 50, "cost_usd": 0.002},
        {"date": "2026-05-28", "model": "anthropic/claude-haiku-4.5", "purpose": "chat", "prompt": 200, "completion": 80, "cost_usd": 0.001},
    ]
    result = _aggregate_usage(records)
    # Higher cost model should come first
    assert result["by_model"][0]["model"] == "openai/gpt-4o"
    assert len(result["by_model"]) == 2


def test_aggregate_usage_multiple_days():
    records = [
        {"date": "2026-05-27", "model": "openai/gpt-4o", "purpose": "chat", "prompt": 100, "completion": 50, "cost_usd": 0.001},
        {"date": "2026-05-28", "model": "openai/gpt-4o", "purpose": "chat", "prompt": 200, "completion": 80, "cost_usd": 0.002},
    ]
    result = _aggregate_usage(records)
    assert len(result["daily"]) == 2
    # Should be sorted by date
    assert result["daily"][0]["date"] == "2026-05-27"
    assert result["daily"][1]["date"] == "2026-05-28"


# ---------------------------------------------------------------------------
# Integration-style tests using mocked DB
# ---------------------------------------------------------------------------

def _make_chat_msg(project_id: uuid.UUID, user_id: uuid.UUID, token_usage: dict, dt: datetime | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        project_id=project_id,
        user_id=user_id,
        role="assistant",
        content="response",
        token_usage=token_usage,
        created_at=dt or datetime.now(timezone.utc),
    )


def _make_doc(project_id: uuid.UUID, user_id: uuid.UUID, extraction_token_usage: dict, dt: datetime | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        project_id=project_id,
        uploaded_by=user_id,
        extraction_token_usage=extraction_token_usage,
        uploaded_at=dt or datetime.now(timezone.utc),
    )


def _make_project(project_id: uuid.UUID, user_id: uuid.UUID, budget: Decimal | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=project_id,
        created_by=user_id,
        monthly_budget_usd=budget,
    )


def _make_mock_db(project: SimpleNamespace, chat_msgs: list, docs: list) -> AsyncMock:
    """Create a mock DB that returns controlled data for all the selects in get_usage."""
    db = AsyncMock()

    call_count = [0]

    async def _execute(stmt):
        call_count[0] += 1
        n = call_count[0]
        if n == 1:
            # Project query
            return SimpleNamespace(scalar_one_or_none=lambda: project)
        elif n == 2:
            # Chat messages (period)
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: chat_msgs))
        elif n == 3:
            # Documents (period)
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: docs))
        elif n == 4:
            # MTD chat messages
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: chat_msgs))
        elif n == 5:
            # MTD documents
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: docs))
        return SimpleNamespace(scalar_one_or_none=lambda: None)

    db.execute = AsyncMock(side_effect=_execute)
    return db


async def test_usage_endpoint_aggregates_chat_and_extraction():
    """get_usage should sum chat + extraction usage correctly."""
    project_id = uuid.uuid4()
    user_id = uuid.uuid4()
    project = _make_project(project_id, user_id)
    member = SimpleNamespace(role="owner")

    chat_msgs = [_make_chat_msg(project_id, user_id, {
        "prompt": 200, "completion": 80, "model": "openai/gpt-4o", "cost_usd": 0.005, "purpose": "chat",
    })]
    docs = [_make_doc(project_id, user_id, {
        "prompt_total": 600, "completion_total": 150, "cost_total_usd": 0.003,
        "breakdown": [{"prompt_tokens": 600, "completion_tokens": 150, "model": "openai/gpt-4o", "cost_usd": 0.003, "purpose": "document_state_extraction"}],
    })]

    db = _make_mock_db(project, chat_msgs, docs)
    result = await get_usage(project_id=project_id, period="30d", db=db, _member=member)

    assert result["total"]["prompt"] == 800
    assert result["total"]["completion"] == 230
    assert abs(result["total"]["cost_usd"] - 0.008) < 1e-6
    purposes = {p["purpose"] for p in result["by_purpose"]}
    assert "chat" in purposes
    assert "document_state_extraction" in purposes


async def test_usage_endpoint_budget_percentage():
    """When budget is set, budget_used_pct should be computed."""
    project_id = uuid.uuid4()
    user_id = uuid.uuid4()
    project = _make_project(project_id, user_id, budget=Decimal("10.00"))
    member = SimpleNamespace(role="owner")

    chat_msgs = [_make_chat_msg(project_id, user_id, {
        "prompt": 100, "completion": 50, "model": "openai/gpt-4o", "cost_usd": 8.0, "purpose": "chat",
    })]
    docs = []

    db = _make_mock_db(project, chat_msgs, docs)
    result = await get_usage(project_id=project_id, period="mtd", db=db, _member=member)

    assert result["budget_usd"] == 10.0
    assert result["budget_used_pct"] is not None
    assert result["budget_used_pct"] == 80.0


async def test_usage_endpoint_null_budget():
    """When no budget, budget_usd and budget_used_pct should be None."""
    project_id = uuid.uuid4()
    user_id = uuid.uuid4()
    project = _make_project(project_id, user_id, budget=None)
    member = SimpleNamespace(role="owner")

    db = _make_mock_db(project, [], [])
    result = await get_usage(project_id=project_id, period="30d", db=db, _member=member)

    assert result["budget_usd"] is None
    assert result["budget_used_pct"] is None


async def test_usage_endpoint_by_model_ordered_by_cost():
    """by_model should be ordered by descending cost_usd."""
    project_id = uuid.uuid4()
    user_id = uuid.uuid4()
    project = _make_project(project_id, user_id)
    member = SimpleNamespace(role="owner")

    chat_msgs = [
        _make_chat_msg(project_id, user_id, {
            "prompt": 100, "completion": 50, "model": "openai/gpt-4o", "cost_usd": 2.0, "purpose": "chat",
        }),
        _make_chat_msg(project_id, user_id, {
            "prompt": 200, "completion": 80, "model": "anthropic/claude-haiku-4.5", "cost_usd": 0.5, "purpose": "chat",
        }),
    ]

    db = _make_mock_db(project, chat_msgs, [])
    result = await get_usage(project_id=project_id, period="30d", db=db, _member=member)

    # Most expensive model first
    assert result["by_model"][0]["model"] == "openai/gpt-4o"
    assert result["by_model"][0]["cost_usd"] == 2.0
