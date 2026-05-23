"""Tests for state_manager.detect_conflicts + merge_state.conflicts injection."""

from __future__ import annotations

from app.services.state_manager import detect_conflicts, merge_state


def _state_with(**core_overrides) -> dict:
    core = {
        "contacts": [],
        "open_tasks": [],
        "deadlines": [],
        "decisions": [],
        "blockers": [],
    }
    core.update(core_overrides)
    return {"core": core, "dynamic_sections": [], "custom": {}}


def test_empty_state_yields_no_conflicts():
    assert detect_conflicts(_state_with()) == []


def test_two_deadlines_same_title_different_dates_yields_conflict():
    state = _state_with(deadlines=[
        {"id": "d1", "title": "Lieferung", "date": "2026-06-14", "source_document_ids": ["doc-A"]},
        {"id": "d2", "title": "Lieferung", "date": "2026-06-16", "source_document_ids": ["doc-B"]},
    ])
    conflicts = detect_conflicts(state)
    assert len(conflicts) == 1
    c = conflicts[0]
    assert c["type"] == "deadline"
    assert c["title"] == "Lieferung"
    assert c["field"] == "date"
    assert {c["a"]["value"], c["b"]["value"]} == {"2026-06-14", "2026-06-16"}
    # Both items expose their first source_document_id for downstream resolution.
    assert set(c["a"]["source_document_ids"] + c["b"]["source_document_ids"]) == {"doc-A", "doc-B"}


def test_two_tasks_same_title_different_status_yields_conflict():
    state = _state_with(open_tasks=[
        {"id": "t1", "title": "Auth fixen", "status": "open"},
        {"id": "t2", "title": "Auth fixen", "status": "done"},
    ])
    conflicts = detect_conflicts(state)
    assert len(conflicts) == 1
    assert conflicts[0]["type"] == "task"
    assert conflicts[0]["field"] == "status"


def test_two_deadlines_same_title_same_date_yields_no_conflict():
    state = _state_with(deadlines=[
        {"id": "d1", "title": "Launch", "date": "2026-07-01"},
        {"id": "d2", "title": "Launch", "date": "2026-07-01"},
    ])
    assert detect_conflicts(state) == []


def test_three_deadlines_same_title_two_diverging_yields_conflict():
    state = _state_with(deadlines=[
        {"id": "d1", "title": "Demo", "date": "2026-06-01"},
        {"id": "d2", "title": "Demo", "date": "2026-06-01"},
        {"id": "d3", "title": "Demo", "date": "2026-06-15"},
    ])
    conflicts = detect_conflicts(state)
    assert len(conflicts) == 1
    assert conflicts[0]["field"] == "date"


def test_title_normalisation_case_and_whitespace_insensitive():
    state = _state_with(deadlines=[
        {"id": "d1", "title": "  Launch Day  ", "date": "2026-06-01"},
        {"id": "d2", "title": "launch day", "date": "2026-06-02"},
    ])
    conflicts = detect_conflicts(state)
    assert len(conflicts) == 1


def test_contacts_diverging_role_yields_conflict():
    state = _state_with(contacts=[
        {"id": "c1", "name": "Alice", "role": "PM"},
        {"id": "c2", "name": "Alice", "role": "Engineer"},
    ])
    conflicts = detect_conflicts(state)
    assert len(conflicts) == 1
    assert conflicts[0]["type"] == "contact"
    assert conflicts[0]["field"] == "role"


def test_blockers_diverging_description_yields_conflict():
    state = _state_with(blockers=[
        {"id": "b1", "title": "Auth", "description": "OAuth bricht"},
        {"id": "b2", "title": "Auth", "description": "SAML hängt"},
    ])
    conflicts = detect_conflicts(state)
    assert len(conflicts) == 1
    assert conflicts[0]["type"] == "blocker"
    assert conflicts[0]["field"] == "description"


def test_dynamic_section_items_are_skipped():
    state = {
        "core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []},
        "dynamic_sections": [
            {
                "title": "Notes",
                "kind": "notes",
                "items": [
                    {"id": "i1", "title": "Same", "date": "2026-01-01"},
                    {"id": "i2", "title": "Same", "date": "2026-01-02"},
                ],
            }
        ],
        "custom": {},
    }
    assert detect_conflicts(state) == []


def test_merge_state_writes_conflicts_into_state():
    """When merge_state runs, it should populate state['conflicts']."""
    current = _state_with(deadlines=[
        {"id": "d1", "title": "Lieferung", "date": "2026-06-14", "source_document_ids": ["doc-A"]},
    ])
    delta = {
        "core": {
            "deadlines": [
                {"id": "d2", "title": "Lieferung", "date": "2026-06-16"},
            ]
        }
    }
    merged = merge_state(current, delta, document_id="doc-B")
    assert "conflicts" in merged
    assert len(merged["conflicts"]) == 1
    assert merged["conflicts"][0]["type"] == "deadline"


def test_merge_state_no_conflicts_yields_empty_list():
    merged = merge_state(_state_with(), {"core": {}}, document_id="doc-A")
    assert merged.get("conflicts") == []


def test_items_with_only_null_diverging_values_no_conflict():
    """If only one item has the field set, that's not a disagreement — no conflict."""
    state = _state_with(deadlines=[
        {"id": "d1", "title": "Launch", "date": "2026-06-01"},
        {"id": "d2", "title": "Launch"},  # date missing
    ])
    assert detect_conflicts(state) == []
