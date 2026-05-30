"""Section T: stale-notice computation (pure, zero-LLM)."""
from datetime import date, datetime, timedelta, timezone

from app.services import stale_notice


def _state_with_deadlines(*deadlines):
    return {"core": {"deadlines": list(deadlines)}}


def test_count_overdue_only_counts_past_pending():
    today = date(2026, 5, 30)
    state = _state_with_deadlines(
        {"title": "A", "date": "2026-05-01"},                    # past → overdue
        {"title": "B", "date": "2026-06-15"},                    # future
        {"title": "C", "date": "2026-05-01", "status": "done"},  # past but resolved
        {"title": "D", "date": None},                            # no date
        {"title": "E", "date": "2026-05-30"},                    # today → not < today
    )
    assert stale_notice.count_overdue_deadlines(state, today) == 1


def test_mark_overdue_in_state_is_idempotent_and_reports_change():
    today = date(2026, 5, 30)
    state = _state_with_deadlines({"title": "A", "date": "2026-05-01"})
    assert stale_notice.mark_overdue_in_state(state, today) is True
    assert state["core"]["deadlines"][0]["status"] == "overdue"
    # second pass: nothing left to change
    assert stale_notice.mark_overdue_in_state(state, today) is False


def test_days_since_activity_naive_and_none():
    assert stale_notice.days_since_activity(None) is None
    past = datetime.now(timezone.utc) - timedelta(days=20)
    assert stale_notice.days_since_activity(past) == 20


def test_compute_returns_none_when_fresh():
    fresh = datetime.now(timezone.utc) - timedelta(days=1)
    assert (
        stale_notice.compute_stale_info(
            stale_marker=False, last_activity_at=fresh, state=_state_with_deadlines()
        )
        is None
    )


def test_compute_builds_bilingual_text():
    old = datetime.now(timezone.utc) - timedelta(days=18)
    state = _state_with_deadlines({"title": "A", "date": "2020-01-01"})
    info = stale_notice.compute_stale_info(
        stale_marker=True, last_activity_at=old, state=state
    )
    assert info is not None
    assert info["is_stale"] is True
    assert info["days_since_activity"] == 18
    assert info["overdue_deadline_count"] == 1
    assert "18" in info["text_de"] and "überfällig" in info["text_de"]
    assert "18 days ago" in info["text_en"] and "overdue" in info["text_en"]
    assert info["dismissed"] is False


def test_compute_dismissed_after_activity():
    old = datetime.now(timezone.utc) - timedelta(days=18)
    dismissed = datetime.now(timezone.utc) - timedelta(days=2)  # after last activity
    info = stale_notice.compute_stale_info(
        stale_marker=True,
        last_activity_at=old,
        state=_state_with_deadlines(),
        dismissed_at=dismissed,
    )
    assert info is not None
    assert info["dismissed"] is True


def test_compute_not_dismissed_when_dismissal_predates_activity():
    old = datetime.now(timezone.utc) - timedelta(days=18)
    dismissed = datetime.now(timezone.utc) - timedelta(days=30)  # before last activity
    info = stale_notice.compute_stale_info(
        stale_marker=True,
        last_activity_at=old,
        state=_state_with_deadlines(),
        dismissed_at=dismissed,
    )
    assert info is not None
    assert info["dismissed"] is False
