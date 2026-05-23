"""Unit tests for compute_next_deadline in state_manager."""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.services.state_manager import compute_next_deadline


def _state(deadlines: list[dict]) -> dict:
    return {"core": {"deadlines": deadlines}}


def _dl(title: str, date_str: str, status: str | None = None) -> dict:
    d: dict = {"title": title, "date": date_str}
    if status is not None:
        d["status"] = status
    return d


TODAY = date.today().isoformat()
TOMORROW = (date.today() + timedelta(days=1)).isoformat()
YESTERDAY = (date.today() - timedelta(days=1)).isoformat()
TWO_AGO = (date.today() - timedelta(days=2)).isoformat()


def test_empty_state_returns_none():
    assert compute_next_deadline({}) is None


def test_empty_deadlines_returns_none():
    assert compute_next_deadline(_state([])) is None


def test_only_upcoming_returns_first_by_date():
    result = compute_next_deadline(_state([
        _dl("Later", TOMORROW),
        _dl("Today", TODAY),
    ]))
    assert result is not None
    assert result["deadline"]["title"] == "Today"
    assert result["is_overdue"] is False


def test_only_overdue_returns_first_by_date():
    result = compute_next_deadline(_state([
        _dl("Older", TWO_AGO),
        _dl("Recent", YESTERDAY),
    ]))
    assert result is not None
    assert result["deadline"]["title"] == "Older"
    assert result["is_overdue"] is True


def test_mix_upcoming_wins_over_overdue():
    result = compute_next_deadline(_state([
        _dl("Overdue", YESTERDAY),
        _dl("Upcoming", TOMORROW),
    ]))
    assert result is not None
    assert result["deadline"]["title"] == "Upcoming"
    assert result["is_overdue"] is False


def test_same_date_alphabetic_tiebreak():
    result = compute_next_deadline(_state([
        _dl("Zebra", TOMORROW),
        _dl("Alpha", TOMORROW),
    ]))
    assert result is not None
    assert result["deadline"]["title"] == "Alpha"


def test_resolved_status_skipped():
    result = compute_next_deadline(_state([
        _dl("Resolved", TODAY, status="resolved"),
        _dl("Open", TOMORROW),
    ]))
    assert result is not None
    assert result["deadline"]["title"] == "Open"


def test_all_resolved_returns_none():
    result = compute_next_deadline(_state([
        _dl("A", TODAY, status="resolved"),
        _dl("B", YESTERDAY, status="resolved"),
    ]))
    assert result is None


def test_invalid_date_string_skipped():
    result = compute_next_deadline(_state([
        _dl("Bad date", "not-a-date"),
        _dl("Good date", TOMORROW),
    ]))
    assert result is not None
    assert result["deadline"]["title"] == "Good date"


def test_all_invalid_dates_returns_none():
    result = compute_next_deadline(_state([
        _dl("Bad", "not-a-date"),
    ]))
    assert result is None


def test_missing_status_field_treated_as_non_resolved():
    result = compute_next_deadline(_state([
        _dl("No status field", TOMORROW),
    ]))
    assert result is not None
    assert result["deadline"]["title"] == "No status field"


def test_no_core_key_returns_none():
    assert compute_next_deadline({"custom": {}}) is None
