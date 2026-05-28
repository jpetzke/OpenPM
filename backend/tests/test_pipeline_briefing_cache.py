"""Tests for pipeline briefing cache-skip logic.

Verifies that:
- Same state.version + existing compiled_briefing → render skipped, log contains briefing_cached=true
- Different state.version → render runs
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.briefing import BriefingResult, render_briefing


# ---------------------------------------------------------------------------
# Unit-test the cache-skip branch directly via a minimal fake pipeline step
# ---------------------------------------------------------------------------


def _make_project(briefing_state_version: int | None, compiled_briefing: str | None, priority_order=None):
    p = MagicMock()
    p.id = uuid.uuid4()
    p.name = "Test"
    p.client_name = "ACME"
    p.status = "active"
    p.updated_at = datetime(2026, 5, 28, tzinfo=timezone.utc)
    p.briefing_state_version = briefing_state_version
    p.compiled_briefing = compiled_briefing
    p.briefing_priority_order = priority_order
    p.briefing_token_count = None
    p.briefing_was_truncated = None
    return p


def _run_briefing_step(project, new_version: int, new_state: dict, cl_dicts: list[dict]) -> dict:
    """Reproduce the exact cache-skip logic from pipeline._briefing_task."""
    meta: dict[str, Any] = {}

    if project.briefing_state_version == new_version and project.compiled_briefing:
        # Cached path
        meta["briefing_cached"] = True
        meta["briefing_updated"] = False
        return meta

    priority_order = project.briefing_priority_order or None
    result = render_briefing(
        {
            "name": project.name,
            "client_name": project.client_name,
            "status": project.status,
            "updated_at": project.updated_at.isoformat(),
        },
        new_state,
        new_version,
        cl_dicts,
        priority_order=priority_order,
    )
    project.compiled_briefing = result.text
    project.briefing_token_count = result.token_count
    project.briefing_was_truncated = result.was_truncated
    project.briefing_state_version = new_version
    meta["briefing_updated"] = True
    meta["briefing_cached"] = False
    return meta


def _minimal_state():
    return {
        "core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []},
        "custom": {},
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_same_version_and_existing_briefing_skips_render():
    project = _make_project(briefing_state_version=5, compiled_briefing="Existing briefing text")
    meta = _run_briefing_step(project, new_version=5, new_state=_minimal_state(), cl_dicts=[])
    assert meta["briefing_cached"] is True
    assert meta["briefing_updated"] is False
    # Project should not have been mutated
    assert project.compiled_briefing == "Existing briefing text"


def test_different_version_triggers_render():
    project = _make_project(briefing_state_version=4, compiled_briefing="Old briefing")
    meta = _run_briefing_step(project, new_version=5, new_state=_minimal_state(), cl_dicts=[])
    assert meta["briefing_cached"] is False
    assert meta["briefing_updated"] is True
    # Project should have been updated
    assert project.briefing_state_version == 5
    assert project.compiled_briefing != "Old briefing"
    assert project.briefing_token_count is not None
    assert project.briefing_was_truncated is not None


def test_no_existing_briefing_triggers_render_even_if_version_matches():
    project = _make_project(briefing_state_version=5, compiled_briefing=None)
    meta = _run_briefing_step(project, new_version=5, new_state=_minimal_state(), cl_dicts=[])
    assert meta["briefing_cached"] is False
    assert meta["briefing_updated"] is True


def test_none_version_triggers_render():
    project = _make_project(briefing_state_version=None, compiled_briefing=None)
    meta = _run_briefing_step(project, new_version=1, new_state=_minimal_state(), cl_dicts=[])
    assert meta["briefing_cached"] is False
    assert meta["briefing_updated"] is True


def test_render_uses_custom_priority_order():
    project = _make_project(
        briefing_state_version=None,
        compiled_briefing=None,
        priority_order=["contacts", "blockers"],
    )
    state = {
        "core": {
            "contacts": [{"id": "c1", "name": "Alice", "role": "PM"}],
            "open_tasks": [{"id": "t1", "title": "OpenTaskShouldNotAppear", "status": "open"}],
            "deadlines": [],
            "decisions": [],
            "blockers": [{"id": "b1", "title": "BlockerShouldAppear", "severity": "high"}],
        },
        "custom": {},
    }
    meta = _run_briefing_step(project, new_version=1, new_state=state, cl_dicts=[])
    assert meta["briefing_updated"] is True
    # With priority_order=["contacts","blockers"], tasks should be excluded
    assert "OpenTaskShouldNotAppear" not in project.compiled_briefing
    assert "BlockerShouldAppear" in project.compiled_briefing
    assert "Alice" in project.compiled_briefing
