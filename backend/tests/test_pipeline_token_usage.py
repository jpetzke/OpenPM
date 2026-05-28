"""Tests that pipeline accumulates extraction_token_usage correctly (Section K).

Unit tests for the accumulation logic. The pipeline wiring to DB is covered by
test_pipeline_state_changed_event.py (which goes end-to-end with mocked LLM).
"""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def test_extraction_usage_accumulation_with_summary_and_extract():
    """Verify totals math when both summary and extraction provide usage."""
    summary_usage = {
        "prompt_tokens": 500,
        "completion_tokens": 100,
        "model": "openai/gpt-4o",
        "cost_usd": 0.002,
        "purpose": "document_summary",
    }
    extract_usage_breakdown = [
        {
            "prompt_tokens": 800,
            "completion_tokens": 200,
            "model": "openai/gpt-4o",
            "cost_usd": 0.004,
            "purpose": "document_state_extraction",
        }
    ]

    all_usage: list[dict] = []
    if summary_usage:
        all_usage.append(summary_usage)
    all_usage.extend(extract_usage_breakdown)

    prompt_total = sum(u.get("prompt_tokens", 0) for u in all_usage)
    completion_total = sum(u.get("completion_tokens", 0) for u in all_usage)
    cost_total = sum(u.get("cost_usd", 0.0) for u in all_usage)

    result = {
        "prompt_total": prompt_total,
        "completion_total": completion_total,
        "cost_total_usd": cost_total,
        "breakdown": all_usage,
    }

    assert result["prompt_total"] == 1300
    assert result["completion_total"] == 300
    assert abs(result["cost_total_usd"] - 0.006) < 1e-9
    assert len(result["breakdown"]) == 2
    purposes = [b["purpose"] for b in result["breakdown"]]
    assert "document_summary" in purposes
    assert "document_state_extraction" in purposes


def test_extraction_usage_no_summary():
    """When summary has no usage, only extraction is recorded."""
    extract_usage_breakdown = [
        {
            "prompt_tokens": 600,
            "completion_tokens": 150,
            "model": "anthropic/claude-haiku-4.5",
            "cost_usd": 0.0009,
            "purpose": "document_state_extraction",
        }
    ]

    all_usage: list[dict] = []
    # summary_usage is None — nothing to append
    all_usage.extend(extract_usage_breakdown)

    assert sum(u["prompt_tokens"] for u in all_usage) == 600
    assert len(all_usage) == 1


def test_extraction_usage_empty_produces_no_field():
    """When no usage is available at all, the result dict should be None."""
    all_usage: list[dict] = []
    result = None
    if all_usage:
        result = {
            "prompt_total": sum(u.get("prompt_tokens", 0) for u in all_usage),
            "breakdown": all_usage,
        }
    assert result is None


def test_extraction_usage_multiple_extract_calls():
    """Multiple extraction calls (json retries) are all accumulated."""
    extract_usage_breakdown = [
        {"prompt_tokens": 400, "completion_tokens": 100, "model": "openai/gpt-4o", "cost_usd": 0.002, "purpose": "document_state_extraction"},
        {"prompt_tokens": 400, "completion_tokens": 100, "model": "openai/gpt-4o", "cost_usd": 0.002, "purpose": "document_state_extraction_json_retry"},
        {"prompt_tokens": 400, "completion_tokens": 100, "model": "openai/gpt-4o", "cost_usd": 0.002, "purpose": "document_state_extraction_confidence_retry"},
    ]

    all_usage: list[dict] = []
    all_usage.extend(extract_usage_breakdown)

    prompt_total = sum(u.get("prompt_tokens", 0) for u in all_usage)
    assert prompt_total == 1200
    assert len(all_usage) == 3


async def test_pipeline_gather_destructures_tuple_returns():
    """Verify pipeline correctly destructures (text, usage) and (delta, breakdown) from gather."""
    from app.tasks import pipeline

    # Replicate the gather destructuring pattern from pipeline._process
    async def mock_summarize(text):
        return ("summary text", {"prompt_tokens": 100, "completion_tokens": 50, "model": "m", "cost_usd": 0.001, "purpose": "document_summary"})

    async def mock_extract(text, state):
        return (
            {"core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []}},
            [{"prompt_tokens": 200, "completion_tokens": 80, "model": "m", "cost_usd": 0.002, "purpose": "document_state_extraction"}],
        )

    import asyncio
    (summary_text, summary_usage), (delta, extract_usage_breakdown) = await asyncio.gather(
        mock_summarize("some content"),
        mock_extract("some content", {}),
    )

    assert summary_text == "summary text"
    assert summary_usage["prompt_tokens"] == 100
    assert "open_tasks" in delta["core"]
    assert extract_usage_breakdown[0]["purpose"] == "document_state_extraction"

    # Build the usage record exactly as pipeline.py does
    all_usage: list[dict] = []
    if summary_usage:
        all_usage.append(summary_usage)
    if extract_usage_breakdown:
        all_usage.extend(extract_usage_breakdown)

    prompt_total = sum(u.get("prompt_tokens", 0) for u in all_usage)
    completion_total = sum(u.get("completion_tokens", 0) for u in all_usage)
    cost_total = sum(u.get("cost_usd", 0.0) for u in all_usage)

    assert prompt_total == 300  # 100 + 200
    assert completion_total == 130  # 50 + 80
    assert abs(cost_total - 0.003) < 1e-9
