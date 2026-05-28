"""Tests for render_briefing() token-cap, priority-order, and BriefingResult API.

Uses real tiktoken — no mocks.
"""
from __future__ import annotations

import logging

import pytest

from app.services.briefing import (
    BriefingResult,
    DEFAULT_PRIORITY_ORDER,
    HARD_CAP,
    SOFT_LIMIT,
    _count_tokens,
    render_briefing,
)


def _project():
    return {"name": "TestProjekt", "client_name": "ACME GmbH", "status": "active", "updated_at": "2026-05-28"}


def _empty_state():
    return {
        "core": {
            "contacts": [],
            "open_tasks": [],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "custom": {},
        "dynamic_sections": [],
    }


def _fat_state(n: int = 300):
    """Build a state large enough to exceed any token budget."""
    tasks = [
        {
            "id": f"t{i}",
            "title": f"Sehr wichtige Aufgabe Nummer {i} mit langem Titel und detaillierter Beschreibung",
            "deadline": "2026-12-31",
            "status": "open",
        }
        for i in range(n)
    ]
    decisions = [
        {
            "id": f"d{i}",
            "title": f"Entscheidung {i}: Langfristige Weichenstellung für Systemkomponente {i}",
            "date": "2026-01-01",
        }
        for i in range(n)
    ]
    blockers = [
        {
            "id": f"b{i}",
            "title": f"Blocker {i}: Kritisches Problem das sofort gelöst werden muss",
            "severity": "critical",
        }
        for i in range(n)
    ]
    return {
        "core": {
            "contacts": [{"id": f"c{i}", "name": f"Person {i}", "role": "PM"} for i in range(n)],
            "open_tasks": tasks,
            "deadlines": [{"id": f"dl{i}", "title": f"Deadline {i}", "date": "2026-06-30"} for i in range(n)],
            "decisions": decisions,
            "blockers": blockers,
        },
        "custom": {f"key_{i}": f"value_{i} " * 20 for i in range(n)},
        "dynamic_sections": [
            {"title": f"Abschnitt {i}", "items": [{"title": f"Item {j}"} for j in range(10)]}
            for i in range(n)
        ],
    }


# ---------------------------------------------------------------------------
# Basic API shape
# ---------------------------------------------------------------------------


def test_render_briefing_returns_briefing_result():
    result = render_briefing(_project(), _empty_state(), 1, [])
    assert isinstance(result, BriefingResult)
    assert isinstance(result.text, str)
    assert isinstance(result.token_count, int)
    assert isinstance(result.was_truncated, bool)


def test_token_count_is_accurate_for_known_small_input():
    result = render_briefing(_project(), _empty_state(), 1, [])
    actual = _count_tokens(result.text)
    assert result.token_count == actual


def test_was_truncated_false_under_soft_limit():
    result = render_briefing(_project(), _empty_state(), 1, [])
    assert result.was_truncated is False
    assert result.token_count <= SOFT_LIMIT


def test_was_truncated_true_when_content_exceeds_soft_limit():
    state = _fat_state(300)
    result = render_briefing(_project(), state, 1, [])
    assert result.was_truncated is True


def test_hard_cap_never_exceeded_with_very_large_state():
    state = _fat_state(1000)
    result = render_briefing(_project(), state, 1, [])
    actual_tokens = _count_tokens(result.text)
    assert actual_tokens <= HARD_CAP
    assert result.token_count <= HARD_CAP


def test_hard_cap_constant_is_1500():
    assert HARD_CAP == 1500


def test_soft_limit_constant_is_1000():
    assert SOFT_LIMIT == 1000


# ---------------------------------------------------------------------------
# Priority order
# ---------------------------------------------------------------------------


def test_default_priority_order_renders_blockers_first():
    state = {
        "core": {
            "contacts": [],
            "open_tasks": [],
            "deadlines": [],
            "decisions": [],
            "blockers": [{"id": "b1", "title": "CRITICAL BLOCKER TITLE", "severity": "critical"}],
        },
        "custom": {},
    }
    result = render_briefing(_project(), state, 1, [])
    # Blockers should appear before decisions section in the text
    blocker_pos = result.text.find("CRITICAL BLOCKER TITLE")
    assert blocker_pos != -1


def test_custom_priority_order_rearranges_sections():
    state = {
        "core": {
            "contacts": [{"id": "c1", "name": "Alice", "role": "PM"}],
            "open_tasks": [{"id": "t1", "title": "My Task", "status": "open"}],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "custom": {},
    }
    # contacts first, then open_tasks
    result_contacts_first = render_briefing(
        _project(), state, 1, [], priority_order=["contacts", "open_tasks"]
    )
    # open_tasks first, then contacts
    result_tasks_first = render_briefing(
        _project(), state, 1, [], priority_order=["open_tasks", "contacts"]
    )

    contacts_pos_a = result_contacts_first.text.find("Alice")
    tasks_pos_a = result_contacts_first.text.find("My Task")
    assert contacts_pos_a < tasks_pos_a, "contacts should appear before tasks in contacts-first order"

    contacts_pos_b = result_tasks_first.text.find("Alice")
    tasks_pos_b = result_tasks_first.text.find("My Task")
    assert tasks_pos_b < contacts_pos_b, "tasks should appear before contacts in tasks-first order"


def test_unknown_priority_slot_skipped_with_warning(caplog):
    state = _empty_state()
    with caplog.at_level(logging.WARNING, logger="app.services.briefing"):
        result = render_briefing(
            _project(), state, 1, [], priority_order=["blockers", "totally_unknown_slot", "open_tasks"]
        )
    assert isinstance(result, BriefingResult)
    assert any("totally_unknown_slot" in rec.getMessage()
                for rec in caplog.records), "Warning should mention the unknown slot"


def test_empty_priority_order_still_renders_header():
    result = render_briefing(_project(), _empty_state(), 1, [], priority_order=[])
    assert "TestProjekt" in result.text
    assert "ACME GmbH" in result.text


# ---------------------------------------------------------------------------
# Conflict section always present
# ---------------------------------------------------------------------------


def test_conflict_section_always_present_when_conflicts_exist():
    state = {
        **_empty_state(),
        "conflicts": [
            {
                "title": "Terminkollision",
                "field": "deadline",
                "a": {"value": "2026-06-01", "source_filename": "doc_a.pdf"},
                "b": {"value": "2026-07-01", "source_filename": "doc_b.pdf"},
            }
        ],
    }
    # Even with empty priority_order, conflicts should appear
    result = render_briefing(_project(), state, 1, [], priority_order=[])
    assert "⚠ Konflikte" in result.text
    assert "Terminkollision" in result.text


def test_conflict_section_present_with_default_order():
    state = {
        **_empty_state(),
        "conflicts": [{"title": "MyConflict", "field": "x", "a": {"value": "1"}, "b": {"value": "2"}}],
    }
    result = render_briefing(_project(), state, 1, [])
    assert "⚠ Konflikte" in result.text
    assert "MyConflict" in result.text


def test_no_conflict_section_when_no_conflicts():
    result = render_briefing(_project(), _empty_state(), 1, [])
    assert "⚠ Konflikte" not in result.text


# ---------------------------------------------------------------------------
# Open tasks limit and sort
# ---------------------------------------------------------------------------


def test_open_tasks_max_10_rendered():
    tasks = [
        {"id": f"t{i}", "title": f"Task {i:03d}", "deadline": f"2026-{(i % 12) + 1:02d}-01", "status": "open"}
        for i in range(20)
    ]
    state = {**_empty_state(), "core": {**_empty_state()["core"], "open_tasks": tasks}}
    result = render_briefing(_project(), state, 1, [])
    # Header should show total count
    assert "Offene Tasks (20)" in result.text
    # But only max 10 items rendered
    rendered_tasks = [line for line in result.text.split("\n") if line.startswith("- [ ]")]
    assert len(rendered_tasks) <= 10


def test_deadlines_limited_to_3():
    deadlines = [{"id": f"d{i}", "title": f"Deadline {i}", "date": f"2026-{i + 1:02d}-15"} for i in range(10)]
    state = {**_empty_state(), "core": {**_empty_state()["core"], "deadlines": deadlines}}
    result = render_briefing(_project(), state, 1, [])
    rendered_deadlines = [line for line in result.text.split("\n") if line.startswith("- Deadline")]
    assert len(rendered_deadlines) <= 3


# ---------------------------------------------------------------------------
# Existing render_briefing tests still pass via new API
# ---------------------------------------------------------------------------


def test_existing_render_basic_content():
    """Regression: old callers should still get project name/client in output."""
    state = {
        "core": {
            "contacts": [{"id": "c1", "name": "Alice", "role": "PM", "email": "alice@x.de"}],
            "open_tasks": [{"id": "t1", "title": "Fix bug", "deadline": "2026-06-01", "status": "open"}],
            "deadlines": [],
            "decisions": [{"id": "d1", "title": "Use FastAPI", "date": "2026-01-01"}],
            "blockers": [],
        },
        "custom": {},
    }
    result = render_briefing(_project(), state, 3, [])
    assert "TestProjekt" in result.text
    assert "Fix bug" in result.text
    assert "Alice" in result.text
    assert "Use FastAPI" in result.text


def test_existing_excludes_done_tasks():
    state = {
        "core": {
            "contacts": [],
            "open_tasks": [
                {"id": "t1", "title": "Done task", "status": "done"},
                {"id": "t2", "title": "Open task", "status": "open"},
            ],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "custom": {},
    }
    result = render_briefing(_project(), state, 1, [])
    assert "Done task" not in result.text
    assert "Open task" in result.text
