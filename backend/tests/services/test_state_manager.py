import pytest

from app.services.state_manager import merge_state, compute_delta, _empty_state


def test_merge_empty_state_with_delta():
    delta = {
        "core": {
            "contacts": [{"name": "Alice", "role": "PM", "email": "alice@x.de"}],
            "open_tasks": [{"title": "Fix bug", "deadline": "2026-06-01"}],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "custom": {},
        "resolved_task_ids": [],
        "removed_blocker_ids": [],
    }
    result = merge_state({}, delta)
    assert len(result["core"]["contacts"]) == 1
    assert result["core"]["contacts"][0]["name"] == "Alice"
    assert result["core"]["contacts"][0]["id"] is not None
    assert len(result["core"]["open_tasks"]) == 1
    assert result["core"]["open_tasks"][0]["title"] == "Fix bug"


def test_contact_deduplication_by_email():
    current = {
        "core": {
            "contacts": [{"id": "c1", "name": "Alice", "email": "alice@x.de", "role": "PM"}],
            "open_tasks": [], "deadlines": [], "decisions": [], "blockers": [],
        },
        "custom": {},
    }
    delta = {
        "core": {"contacts": [{"name": "Alice Updated", "email": "alice@x.de", "role": "Lead"}]},
        "custom": {},
        "resolved_task_ids": [],
        "removed_blocker_ids": [],
    }
    result = merge_state(current, delta)
    assert len(result["core"]["contacts"]) == 1
    assert result["core"]["contacts"][0]["role"] == "Lead"


def test_resolve_task():
    task_id = "task-abc-123"
    current = {
        "core": {
            "contacts": [],
            "open_tasks": [{"id": task_id, "title": "Do thing", "status": "open"}],
            "deadlines": [], "decisions": [], "blockers": [],
        },
        "custom": {},
    }
    delta = {
        "core": {"open_tasks": []},
        "custom": {},
        "resolved_task_ids": [task_id],
        "removed_blocker_ids": [],
    }
    result = merge_state(current, delta)
    assert result["core"]["open_tasks"][0]["status"] == "done"


def test_remove_blocker():
    blocker_id = "blocker-xyz"
    current = {
        "core": {
            "contacts": [], "open_tasks": [], "deadlines": [], "decisions": [],
            "blockers": [{"id": blocker_id, "title": "Blocked", "severity": "high"}],
        },
        "custom": {},
    }
    delta = {
        "core": {"blockers": []},
        "custom": {},
        "resolved_task_ids": [],
        "removed_blocker_ids": [blocker_id],
    }
    result = merge_state(current, delta)
    assert len(result["core"]["blockers"]) == 0


def test_decisions_always_appended():
    current = {
        "core": {
            "contacts": [], "open_tasks": [], "deadlines": [],
            "decisions": [{"id": "d1", "title": "Use FastAPI", "date": "2026-01-01"}],
            "blockers": [],
        },
        "custom": {},
    }
    delta = {
        "core": {"decisions": [{"title": "Use PostgreSQL", "date": "2026-02-01"}]},
        "custom": {},
        "resolved_task_ids": [],
        "removed_blocker_ids": [],
    }
    result = merge_state(current, delta)
    assert len(result["core"]["decisions"]) == 2


def test_compute_delta():
    old = {"core": {"contacts": [{"id": "c1", "name": "Alice"}], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []}, "custom": {}}
    new = {"core": {"contacts": [{"id": "c1", "name": "Alice"}, {"id": "c2", "name": "Bob"}], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []}, "custom": {}}
    delta = compute_delta(old, new)
    assert "core.contacts" in delta["added"]
    assert delta["added"]["core.contacts"][0]["name"] == "Bob"


def test_custom_shallow_merge():
    current = {"core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []}, "custom": {"foo": "bar"}}
    delta = {"core": {}, "custom": {"baz": "qux"}, "resolved_task_ids": [], "removed_blocker_ids": []}
    result = merge_state(current, delta)
    assert result["custom"]["foo"] == "bar"
    assert result["custom"]["baz"] == "qux"
