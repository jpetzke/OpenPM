"""Stale-project notice computation — zero-LLM, zero-token.

A project is *stale* when no document upload or chat message has happened for
more than ``STALE_DAYS`` days. Overdue deadlines are counted from the latest
state snapshot (a deadline whose ``date`` is in the past and that is not
resolved). Both numbers feed a hard-coded bilingual banner template — no LLM
call, so no token cost (roadmap section T).
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Optional

STALE_DAYS = 14

# Deadline statuses that mean "no longer pending" → never counted as overdue.
_RESOLVED_DEADLINE_STATUSES = {"resolved", "done", "completed", "erledigt"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_date(value: Any) -> Optional[date]:
    """Best-effort parse of a deadline date (``YYYY-MM-DD`` or ISO datetime)."""
    if not value or not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
        except ValueError:
            return None


def count_overdue_deadlines(state: Optional[dict], today: Optional[date] = None) -> int:
    """Number of pending deadlines whose date is strictly before today."""
    if not state:
        return 0
    today = today or _now().date()
    deadlines = (state.get("core") or {}).get("deadlines") or []
    overdue = 0
    for dl in deadlines:
        if not isinstance(dl, dict):
            continue
        status = str(dl.get("status") or "").lower()
        if status in _RESOLVED_DEADLINE_STATUSES:
            continue
        due = _parse_date(dl.get("date"))
        if due is not None and due < today:
            overdue += 1
    return overdue


def mark_overdue_in_state(state: Optional[dict], today: Optional[date] = None) -> bool:
    """Annotate pending+past deadlines with ``status="overdue"`` in place.

    Mutates ``state`` (the *current* snapshot, no new version). Returns True if
    anything changed, so the caller can skip a no-op DB write.
    """
    if not state:
        return False
    today = today or _now().date()
    deadlines = (state.get("core") or {}).get("deadlines") or []
    changed = False
    for dl in deadlines:
        if not isinstance(dl, dict):
            continue
        status = str(dl.get("status") or "").lower()
        if status in _RESOLVED_DEADLINE_STATUSES or status == "overdue":
            continue
        due = _parse_date(dl.get("date"))
        if due is not None and due < today:
            dl["status"] = "overdue"
            changed = True
    return changed


def days_since_activity(last_activity_at: Optional[datetime]) -> Optional[int]:
    if last_activity_at is None:
        return None
    if last_activity_at.tzinfo is None:
        last_activity_at = last_activity_at.replace(tzinfo=timezone.utc)
    delta = _now() - last_activity_at
    return max(0, delta.days)


def _notice_text(days: Optional[int], overdue: int) -> tuple[str, str]:
    """Build the (German, English) banner strings from the counts."""
    parts_de: list[str] = []
    parts_en: list[str] = []
    if days is not None:
        parts_de.append(f"Letzter Upload vor {days} Tagen.")
        parts_en.append(f"Last upload {days} days ago.")
    if overdue > 0:
        d_word = "Deadline überfällig" if overdue == 1 else "Deadlines überfällig"
        e_word = "deadline overdue" if overdue == 1 else "deadlines overdue"
        parts_de.append(f"{overdue} {d_word}.")
        parts_en.append(f"{overdue} {e_word}.")
    return " ".join(parts_de), " ".join(parts_en)


def compute_stale_info(
    *,
    stale_marker: bool,
    last_activity_at: Optional[datetime],
    state: Optional[dict],
    dismissed_at: Optional[datetime] = None,
) -> Optional[dict]:
    """Return the banner payload, or None when the project is not stale.

    Stale = ``stale_marker`` set (by the cron) OR there is at least one overdue
    deadline. ``dismissed`` is true when the user dismissed the banner *after*
    the last activity (a fresh upload resets activity → banner can reappear).
    """
    days = days_since_activity(last_activity_at)
    overdue = count_overdue_deadlines(state)
    is_stale = bool(stale_marker) or overdue > 0
    if not is_stale:
        return None

    dismissed = False
    if dismissed_at is not None:
        d = dismissed_at if dismissed_at.tzinfo else dismissed_at.replace(tzinfo=timezone.utc)
        la = last_activity_at
        if la is not None and la.tzinfo is None:
            la = la.replace(tzinfo=timezone.utc)
        dismissed = la is None or d >= la

    text_de, text_en = _notice_text(days, overdue)
    return {
        "is_stale": True,
        "days_since_activity": days,
        "overdue_deadline_count": overdue,
        "dismissed": dismissed,
        "text_de": text_de,
        "text_en": text_en,
    }
