"""Tests for source_document_ids union behavior in merge_state."""

from __future__ import annotations

from app.services.state_manager import merge_state


def test_existing_item_sources_unioned_with_delta_sources():
    current = {
        "core": {
            "contacts": [
                {
                    "id": "c1",
                    "name": "Alice",
                    "email": "alice@example.com",
                    "source_document_ids": ["doc-A"],
                }
            ],
            "open_tasks": [],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
        "custom": {},
    }
    delta = {
        "core": {
            "contacts": [
                {
                    "id": "c1",
                    "name": "Alice",
                    "email": "alice@example.com",
                    "role": "PM",
                    "source_document_ids": ["doc-B"],
                }
            ]
        }
    }
    merged = merge_state(current, delta, document_id="doc-C")
    [contact] = merged["core"]["contacts"]
    assert contact["source_document_ids"] == ["doc-A", "doc-B"]
    assert contact["role"] == "PM"


def test_new_task_gets_document_id_as_source():
    current = {"core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []}, "dynamic_sections": [], "custom": {}}
    delta = {"core": {"open_tasks": [{"id": "t1", "title": "New thing"}]}}

    merged = merge_state(current, delta, document_id="doc-X")
    [task] = merged["core"]["open_tasks"]
    assert task["source_document_ids"] == ["doc-X"]


def test_new_task_with_legacy_singular_field_is_promoted():
    current = {"core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []}, "dynamic_sections": [], "custom": {}}
    delta = {"core": {"open_tasks": [{"id": "t2", "title": "Legacy", "source_document_id": "doc-Y"}]}}

    merged = merge_state(current, delta, document_id="doc-Z")
    [task] = merged["core"]["open_tasks"]
    assert task["source_document_ids"] == ["doc-Y"]
    assert "source_document_id" not in task


def test_dynamic_section_source_union_preserved():
    current = {
        "core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []},
        "dynamic_sections": [
            {
                "id": "s1",
                "title": "Risks",
                "kind": "risks",
                "items": [{"id": "i1", "title": "Item", "source_document_ids": ["doc-A"]}],
                "source_document_ids": ["doc-A"],
            }
        ],
        "custom": {},
    }
    delta = {
        "dynamic_sections": [
            {
                "id": "s1",
                "title": "Risks",
                "kind": "risks",
                "items": [{"id": "i1", "title": "Item updated", "source_document_ids": ["doc-B"]}],
                "source_document_ids": ["doc-B"],
            }
        ]
    }

    merged = merge_state(current, delta, document_id="doc-C")
    [section] = merged["dynamic_sections"]
    assert section["source_document_ids"] == ["doc-A", "doc-B"]
    [item] = section["items"]
    assert item["source_document_ids"] == ["doc-A", "doc-B"]
    assert item["title"] == "Item updated"


def test_new_deadline_dedup_unions_sources():
    current = {
        "core": {
            "contacts": [],
            "open_tasks": [],
            "deadlines": [
                {"id": "d1", "title": "Launch", "date": "2026-06-01", "source_document_ids": ["doc-A"]}
            ],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
        "custom": {},
    }
    delta = {
        "core": {
            "deadlines": [
                {"title": "Launch", "date": "2026-06-01", "source_document_ids": ["doc-B"]}
            ]
        }
    }
    merged = merge_state(current, delta, document_id="doc-C")
    [d] = merged["core"]["deadlines"]
    assert d["source_document_ids"] == ["doc-A", "doc-B"]


def test_new_decision_gets_document_id():
    current = {"core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []}, "dynamic_sections": [], "custom": {}}
    delta = {"core": {"decisions": [{"title": "Use Postgres", "date": "2026-05-01"}]}}
    merged = merge_state(current, delta, document_id="doc-D")
    [decision] = merged["core"]["decisions"]
    assert decision["source_document_ids"] == ["doc-D"]


def test_new_blocker_gets_document_id():
    current = {"core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []}, "dynamic_sections": [], "custom": {}}
    delta = {"core": {"blockers": [{"title": "Auth broken", "severity": "high"}]}}
    merged = merge_state(current, delta, document_id="doc-B")
    [blocker] = merged["core"]["blockers"]
    assert blocker["source_document_ids"] == ["doc-B"]


def test_merge_without_document_id_does_not_invent_sources():
    current = {"core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []}, "dynamic_sections": [], "custom": {}}
    delta = {"core": {"open_tasks": [{"id": "t1", "title": "Task"}]}}
    merged = merge_state(current, delta)
    [task] = merged["core"]["open_tasks"]
    assert "source_document_ids" not in task or task["source_document_ids"] == []
