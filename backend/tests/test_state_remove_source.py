"""Tests for state_manager.remove_document_source."""
from __future__ import annotations

import copy

from app.services.state_manager import remove_document_source


def _state_with_items(*, doc_ids: list[str], last_modified_source: str | None = None) -> dict:
    task = {
        "id": "task-1",
        "title": "Do something",
        "status": "open",
        "source_document_ids": list(doc_ids),
    }
    if last_modified_source:
        task["last_modified_source"] = last_modified_source
    contact = {
        "id": "contact-1",
        "name": "Alice",
        "role": "PM",
        "source_document_ids": list(doc_ids),
    }
    if last_modified_source:
        contact["last_modified_source"] = last_modified_source
    return {
        "core": {
            "contacts": [contact],
            "open_tasks": [task],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [
            {
                "title": "Notes",
                "kind": "notes",
                "items": [
                    {
                        "id": "dyn-1",
                        "title": "Note A",
                        "source_document_ids": list(doc_ids),
                        **({"last_modified_source": last_modified_source} if last_modified_source else {}),
                    }
                ],
            }
        ],
        "custom": {},
    }


def test_multi_source_item_keeps_remaining_sources():
    state = _state_with_items(doc_ids=["doc-a", "doc-b"])
    summary = remove_document_source(state, "doc-a")
    task = state["core"]["open_tasks"][0]
    assert task["source_document_ids"] == ["doc-b"]
    assert summary["retained_count"] == 3
    assert summary["removed_count"] == 0
    assert summary["orphaned_count"] == 0


def test_only_doc_source_item_drops_when_no_chat_manual():
    state = _state_with_items(doc_ids=["doc-a"])
    summary = remove_document_source(state, "doc-a")
    assert state["core"]["open_tasks"] == []
    assert state["core"]["contacts"] == []
    assert state["dynamic_sections"][0]["items"] == []
    assert summary["removed_count"] == 3
    assert summary["retained_count"] == 0
    assert summary["orphaned_count"] == 0


def test_chat_mutated_item_becomes_orphaned():
    state = _state_with_items(doc_ids=["doc-a"], last_modified_source="chat:session-123")
    summary = remove_document_source(state, "doc-a")
    task = state["core"]["open_tasks"][0]
    assert task["source_document_ids"] == ["orphaned:doc-a"]
    assert summary["orphaned_count"] == 3
    assert summary["removed_count"] == 0


def test_manual_mutated_item_becomes_orphaned():
    state = _state_with_items(doc_ids=["doc-a"], last_modified_source="manual:user")
    summary = remove_document_source(state, "doc-a")
    contact = state["core"]["contacts"][0]
    assert contact["source_document_ids"] == ["orphaned:doc-a"]
    assert summary["orphaned_count"] == 3


def test_item_not_referencing_doc_is_retained():
    state = _state_with_items(doc_ids=["doc-b"])
    summary = remove_document_source(state, "doc-a")
    assert len(state["core"]["open_tasks"]) == 1
    assert summary["retained_count"] == 3
    assert summary["removed_count"] == 0


def test_dynamic_sections_items_handled():
    state = {
        "core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []},
        "dynamic_sections": [
            {
                "title": "Risks",
                "kind": "risk",
                "items": [
                    {"id": "r1", "title": "Risk 1", "source_document_ids": ["doc-x"]},
                    {"id": "r2", "title": "Risk 2", "source_document_ids": ["doc-x", "doc-y"]},
                ],
            }
        ],
        "custom": {},
    }
    summary = remove_document_source(state, "doc-x")
    items = state["dynamic_sections"][0]["items"]
    assert len(items) == 1
    assert items[0]["id"] == "r2"
    assert items[0]["source_document_ids"] == ["doc-y"]
    assert summary["removed_count"] == 1
    assert summary["retained_count"] == 1
