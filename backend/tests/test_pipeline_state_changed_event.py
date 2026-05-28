"""Verify that _process publishes a state_changed SSE event with correct sections.

We drive _process via a heavily-mocked environment: DB session, Redis, git,
Qdrant, and LLM calls are all stubbed. The test asserts that after the state
is persisted the pipeline publishes exactly one `state_changed` event whose
`sections` list includes every section key that had non-empty items in the
LLM delta.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import text

from app.tasks import pipeline
from app.models.state import ProjectState, StateChangelog
from app.models.project import Project
from app.models.document import Document
from app.services.briefing import BriefingResult


def _make_doc(project_id: uuid.UUID, doc_id: uuid.UUID) -> SimpleNamespace:
    return SimpleNamespace(
        id=doc_id,
        project_id=project_id,
        original_path="projects/x/test.txt",
        original_filename="test.txt",
        mime_type="text/plain",
        file_size=100,
        processing_status="pending",
        processing_error=None,
        error_class=None,
        pipeline_logs=[],
        pipeline_step=0,
        pipeline_step_label=None,
        pipeline_updated_at=datetime.now(timezone.utc),
        arq_job_id=None,
        raw_content=None,
        doc_metadata=None,
        summary=None,
        git_commit_hash=None,
        extraction_token_usage=None,
    )


def _scalar_result(value):
    return SimpleNamespace(scalar_one_or_none=lambda: value)


def _scalar_one_result(value):
    return SimpleNamespace(scalar_one=lambda: value)


def _scalar_all_result(values):
    return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: values))


def _make_db_execute(doc, existing_state_obj, new_state_obj, project_obj):
    """Return an execute coroutine that routes responses by sequential call number.

    Pipeline _process() db.execute() call order:
      1  select(Document)                           → scalar_one_or_none → doc
      2  text("pg_advisory_xact_lock")              → SimpleNamespace (result not used)
      3  select(ProjectState) latest version        → scalar_one_or_none → existing_state_obj
      4  select(ProjectState) for triggered_by_doc  → scalar_one_or_none → None
      5  pg_insert(ProjectState).returning()        → scalar_one → new_state_obj
      6  select(Project)                            → scalar_one_or_none → project_obj
      7  select(StateChangelog) recent limit(3)     → scalars().all() → []
      8  select(Document) for documents_by_id       → scalars().all() → [doc]
    """
    call_count = [0]

    async def execute(stmt, params=None):
        call_count[0] += 1
        n = call_count[0]
        stmt_str = str(stmt)
        if "pg_advisory_xact_lock" in stmt_str:
            return SimpleNamespace()
        if n == 1:
            return _scalar_result(doc)
        if n == 3:
            return _scalar_result(existing_state_obj)
        if n == 4:
            return _scalar_result(None)
        if n == 5:
            return _scalar_one_result(new_state_obj)
        if n == 6:
            return _scalar_result(project_obj)
        if n == 7:
            return _scalar_all_result([])
        if n == 8:
            return _scalar_all_result([doc])
        return _scalar_result(None)

    return execute


async def _run_process(doc, existing_state_obj, new_state_obj, project_obj,
                       delta, project_id, doc_id):
    session_obj = SimpleNamespace(id=uuid.uuid4())
    published_events: list[dict] = []

    async def fake_publish(redis, channel, event):
        published_events.append(event)

    db = AsyncMock()
    db.execute = _make_db_execute(doc, existing_state_obj, new_state_obj, project_obj)
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.add = MagicMock()
    db.rollback = AsyncMock()

    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)

    with (
        patch("app.tasks.pipeline._publish", side_effect=fake_publish),
        patch("app.tasks.pipeline._check_cancel", AsyncMock()),
        patch("app.tasks.pipeline.parse_document", AsyncMock(return_value=("text content", {}, []))),
        patch("app.tasks.pipeline.summarize_document", AsyncMock(return_value=("summary", None))),
        patch("app.tasks.pipeline.extract_state_delta", AsyncMock(return_value=(delta, []))),
        patch("app.tasks.pipeline.git_service.commit_state", return_value="abc123"),
        patch("app.tasks.pipeline.qdrant_service.upsert_chunks", AsyncMock()),
        patch("app.tasks.pipeline.get_active_provider", AsyncMock(return_value=None)),
        patch("app.tasks.pipeline.change_session_service.get_or_open", AsyncMock(return_value=session_obj)),
        patch("app.tasks.pipeline.briefing_service.render_briefing", return_value=BriefingResult(text="briefing", token_count=5, was_truncated=False)),
        patch("app.services.storage.get_document_bytes", return_value=b"bytes"),
    ):
        await pipeline._process(db, redis, doc_id, project_id)

    return published_events


async def test_state_changed_event_published_with_correct_sections():
    project_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    doc = _make_doc(project_id, doc_id)

    delta = {
        "core": {
            "open_tasks": [{"title": "Task A", "confidence": "high"}],
            "contacts": [],
            "deadlines": [{"title": "Demo", "date": "2026-12-01"}],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
    }

    current_state = {
        "core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []},
        "dynamic_sections": [],
        "custom": {},
    }

    existing_state_obj = SimpleNamespace(state=current_state, version=1)
    new_state_obj = SimpleNamespace(id=uuid.uuid4(), project_id=project_id, version=2, state={})
    project_obj = SimpleNamespace(
        id=project_id, name="Test", client_name="Client", status="active",
        updated_at=datetime.now(timezone.utc), compiled_briefing=None,
        briefing_state_version=None, briefing_priority_order=None,
        briefing_token_count=None, briefing_was_truncated=None,
    )

    published_events = await _run_process(
        doc, existing_state_obj, new_state_obj, project_obj, delta, project_id, doc_id
    )

    state_changed = [e for e in published_events if e.get("event") == "state_changed"]
    assert len(state_changed) == 1, f"Expected 1 state_changed, got {len(state_changed)}. All events: {[e.get('event') for e in published_events]}"

    ev = state_changed[0]
    assert ev["project_id"] == str(project_id)
    assert ev["version"] == 2
    assert "tasks" in ev["sections"], f"sections={ev['sections']}"
    assert "deadlines" in ev["sections"], f"sections={ev['sections']}"
    assert "contacts" not in ev["sections"]
    assert "decisions" not in ev["sections"]
    assert "blockers" not in ev["sections"]


async def test_state_changed_event_omitted_sections_when_empty():
    """When delta has only decisions, sections should only contain 'decisions'."""
    project_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    doc = _make_doc(project_id, doc_id)

    delta = {
        "core": {
            "open_tasks": [],
            "contacts": [],
            "deadlines": [],
            "decisions": [{"title": "Use postgres", "date": "2026-05-01"}],
            "blockers": [],
        },
        "dynamic_sections": [],
    }

    current_state = {
        "core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []},
        "dynamic_sections": [],
        "custom": {},
    }

    existing_state_obj = SimpleNamespace(state=current_state, version=1)
    new_state_obj = SimpleNamespace(id=uuid.uuid4(), project_id=project_id, version=2, state={})
    project_obj = SimpleNamespace(
        id=project_id, name="T", client_name="C", status="active",
        updated_at=datetime.now(timezone.utc), compiled_briefing=None,
        briefing_state_version=None, briefing_priority_order=None,
        briefing_token_count=None, briefing_was_truncated=None,
    )

    published_events = await _run_process(
        doc, existing_state_obj, new_state_obj, project_obj, delta, project_id, doc_id
    )

    state_changed = [e for e in published_events if e.get("event") == "state_changed"]
    assert len(state_changed) == 1
    ev = state_changed[0]
    assert ev["sections"] == ["decisions"]
