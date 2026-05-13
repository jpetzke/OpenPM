from datetime import datetime, timezone

from app.services.briefing import render_briefing


def _make_project(name="Test Project", client="ACME", status="active"):
    return {"name": name, "client_name": client, "status": status, "updated_at": "2026-05-13"}


def test_render_basic_briefing():
    project = _make_project()
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
    result = render_briefing(project, state, 3, [])
    assert "Test Project" in result
    assert "ACME" in result
    assert "Fix bug" in result
    assert "Alice" in result
    assert "Use FastAPI" in result


def test_render_excludes_done_tasks():
    project = _make_project()
    state = {
        "core": {
            "contacts": [],
            "open_tasks": [
                {"id": "t1", "title": "Done task", "status": "done"},
                {"id": "t2", "title": "Open task", "status": "open"},
            ],
            "deadlines": [], "decisions": [], "blockers": [],
        },
        "custom": {},
    }
    result = render_briefing(project, state, 1, [])
    assert "Done task" not in result
    assert "Open task" in result


def test_render_with_changelog():
    project = _make_project()
    state = {"core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []}, "custom": {}}
    changelog = [{"to_version": 2, "triggered_by": "pipeline"}, {"to_version": 3, "triggered_by": "chat_tool"}]
    result = render_briefing(project, state, 3, changelog)
    assert "pipeline" in result
