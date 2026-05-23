"""Tests that chat-tool mutations write chat:{session_id} into source_document_ids."""

from __future__ import annotations

import copy
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.routers.chat import _append_chat_source, _update_task_status


# ---------------------------------------------------------------------------
# Helper-level tests
# ---------------------------------------------------------------------------

def test_append_chat_source_adds_tag_to_empty_item():
    session_id = uuid.uuid4()
    item: dict = {}
    _append_chat_source(item, session_id)
    assert item["source_document_ids"] == [f"chat:{session_id}"]


def test_append_chat_source_appends_to_existing_list():
    session_id = uuid.uuid4()
    item = {"source_document_ids": ["doc-A"]}
    _append_chat_source(item, session_id)
    assert item["source_document_ids"] == ["doc-A", f"chat:{session_id}"]


def test_append_chat_source_dedupes_when_called_twice():
    session_id = uuid.uuid4()
    item: dict = {}
    _append_chat_source(item, session_id)
    _append_chat_source(item, session_id)
    assert item["source_document_ids"] == [f"chat:{session_id}"]


def test_append_chat_source_promotes_legacy_singular_field():
    session_id = uuid.uuid4()
    item = {"source_document_id": "doc-L"}
    _append_chat_source(item, session_id)
    assert item["source_document_ids"] == ["doc-L", f"chat:{session_id}"]
    assert "source_document_id" not in item


def test_append_chat_source_skips_when_session_id_is_none():
    item: dict = {}
    _append_chat_source(item, None)
    assert "source_document_ids" not in item


# ---------------------------------------------------------------------------
# _update_task_status integration with mocked DB
# ---------------------------------------------------------------------------

def _build_db_with_state(initial_state: dict) -> tuple[MagicMock, list]:
    """Return (db_mock, added_objects) where the executes return ProjectState then Project."""
    project_state_holder = SimpleNamespace(state=initial_state, version=1)
    project_holder = SimpleNamespace(
        name="P", client_name="C", status="active",
        updated_at=SimpleNamespace(isoformat=lambda: "2026-05-22T00:00:00"),
        compiled_briefing=None,
    )

    added: list = []

    db = MagicMock()
    db.add = MagicMock(side_effect=lambda obj: added.append(obj))
    db.commit = AsyncMock()

    # First execute → returns ProjectState; second → Project.
    state_result = MagicMock()
    state_result.scalar_one_or_none = MagicMock(return_value=project_state_holder)
    project_result = MagicMock()
    project_result.scalar_one_or_none = MagicMock(return_value=project_holder)

    db.execute = AsyncMock(side_effect=[state_result, project_result])
    return db, added


async def test_update_task_status_appends_chat_source_to_task():
    session_id = uuid.uuid4()
    project_id = uuid.uuid4()
    task_id = "task-xyz"
    initial = {
        "core": {
            "open_tasks": [
                {"id": task_id, "title": "Demo", "status": "open", "source_document_ids": ["doc-A"]},
            ],
            "contacts": [], "deadlines": [], "decisions": [], "blockers": [],
        },
        "dynamic_sections": [],
        "custom": {},
    }
    db, added = _build_db_with_state(initial)

    with patch("app.routers.chat.git_service.commit_state", return_value="hash-1"), \
         patch("app.routers.chat.briefing_service.render_briefing", return_value="briefing"):
        result = await _update_task_status(
            {"task_id": task_id, "status": "done"},
            project_id, db, redis_client=None, session_id=session_id,
        )

    assert result["success"] is True
    # The newly-added ProjectState should carry the chat: tag on the task.
    new_state_objs = [a for a in added if hasattr(a, "state")]
    assert new_state_objs, "expected a new ProjectState row to be added"
    new_state = new_state_objs[0].state
    [task] = new_state["core"]["open_tasks"]
    assert f"chat:{session_id}" in task["source_document_ids"]
    assert "doc-A" in task["source_document_ids"], "existing source must be preserved"


async def test_update_task_status_dedupes_chat_source_on_second_call():
    """Calling update_task_status twice with the same session_id should not duplicate the tag."""
    session_id = uuid.uuid4()
    project_id = uuid.uuid4()
    task_id = "task-xyz"
    # Simulate a task that already has the chat: tag from a previous call.
    initial = {
        "core": {
            "open_tasks": [
                {
                    "id": task_id,
                    "title": "Demo",
                    "status": "open",
                    "source_document_ids": [f"chat:{session_id}"],
                },
            ],
            "contacts": [], "deadlines": [], "decisions": [], "blockers": [],
        },
        "dynamic_sections": [],
        "custom": {},
    }
    db, added = _build_db_with_state(initial)

    with patch("app.routers.chat.git_service.commit_state", return_value="hash-2"), \
         patch("app.routers.chat.briefing_service.render_briefing", return_value="briefing"):
        await _update_task_status(
            {"task_id": task_id, "status": "blocked"},
            project_id, db, redis_client=None, session_id=session_id,
        )

    new_state_objs = [a for a in added if hasattr(a, "state")]
    [task] = new_state_objs[0].state["core"]["open_tasks"]
    chat_tags = [s for s in task["source_document_ids"] if s.startswith("chat:")]
    assert chat_tags == [f"chat:{session_id}"], "duplicate chat tag must not appear"


async def test_update_task_status_without_session_id_does_not_add_chat_source():
    project_id = uuid.uuid4()
    task_id = "task-xyz"
    initial = {
        "core": {
            "open_tasks": [
                {"id": task_id, "title": "Demo", "status": "open", "source_document_ids": ["doc-A"]},
            ],
            "contacts": [], "deadlines": [], "decisions": [], "blockers": [],
        },
        "dynamic_sections": [],
        "custom": {},
    }
    db, added = _build_db_with_state(initial)

    with patch("app.routers.chat.git_service.commit_state", return_value="hash-3"), \
         patch("app.routers.chat.briefing_service.render_briefing", return_value="briefing"):
        await _update_task_status(
            {"task_id": task_id, "status": "done"},
            project_id, db, redis_client=None, session_id=None,
        )

    new_state_objs = [a for a in added if hasattr(a, "state")]
    [task] = new_state_objs[0].state["core"]["open_tasks"]
    chat_tags = [s for s in task["source_document_ids"] if s.startswith("chat:")]
    assert chat_tags == [], "no chat tag should be added without session_id"
