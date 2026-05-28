"""Tests for source-line rendering and conflicts section in render_briefing."""

from __future__ import annotations

from types import SimpleNamespace

from app.services.briefing import render_briefing


def _project_dict() -> dict:
    return {
        "name": "Demo",
        "client_name": "ACME",
        "status": "active",
        "updated_at": "2026-05-22T00:00:00+00:00",
    }


def _doc(id_: str, name: str) -> SimpleNamespace:
    return SimpleNamespace(id=id_, original_filename=name)


def test_renders_source_line_for_task():
    state = {
        "core": {
            "contacts": [],
            "open_tasks": [
                {"id": "t1", "title": "Do thing", "source_document_ids": ["doc-A"]}
            ],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
        "custom": {},
    }
    docs = {"doc-A": _doc("doc-A", "notes.txt")}
    _result = render_briefing(_project_dict(), state, 1, [], documents_by_id=docs)
    out = _result.text
    assert "Do thing" in out
    assert "Quelle: notes.txt" in out


def test_chat_source_renders_aus_chat():
    state = {
        "core": {
            "contacts": [],
            "open_tasks": [
                {"id": "t1", "title": "Chat task", "source_document_ids": ["chat:abc-session"]}
            ],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
        "custom": {},
    }
    _result = render_briefing(_project_dict(), state, 1, [], documents_by_id={})
    out = _result.text
    assert "aus Chat" in out


def test_legacy_source_renders_special_marker():
    state = {
        "core": {
            "contacts": [],
            "open_tasks": [
                {"id": "t1", "title": "Old task", "source_document_ids": ["legacy:pre-migration"]}
            ],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
        "custom": {},
    }
    _result = render_briefing(_project_dict(), state, 1, [], documents_by_id={})
    out = _result.text
    assert "Quelle vor Migration verloren" in out


def test_manual_source_renders_manuell():
    state = {
        "core": {
            "contacts": [],
            "open_tasks": [
                {"id": "t1", "title": "Manual", "source_document_ids": ["manual:user-edit"]}
            ],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
        "custom": {},
    }
    _result = render_briefing(_project_dict(), state, 1, [], documents_by_id={})
    out = _result.text
    assert "manuell" in out


def test_multiple_sources_comma_joined():
    state = {
        "core": {
            "contacts": [],
            "open_tasks": [
                {"id": "t1", "title": "Multi", "source_document_ids": ["doc-A", "doc-B"]}
            ],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
        "custom": {},
    }
    docs = {"doc-A": _doc("doc-A", "a.txt"), "doc-B": _doc("doc-B", "b.txt")}
    _result = render_briefing(_project_dict(), state, 1, [], documents_by_id=docs)
    out = _result.text
    assert "Quelle: a.txt, b.txt" in out


def test_conflicts_section_rendered_when_present():
    state = {
        "core": {
            "contacts": [],
            "open_tasks": [],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
        "custom": {},
        "conflicts": [
            {
                "title": "Budget",
                "field": "amount",
                "a": {"field": "amount", "value": "10k", "source_filename": "doc-a.txt"},
                "b": {"field": "amount", "value": "20k", "source_filename": "doc-b.txt"},
            }
        ],
    }
    _result = render_briefing(_project_dict(), state, 1, [], documents_by_id={})
    out = _result.text
    assert "Konflikte" in out
    assert "Budget" in out
    assert "amount: 10k (aus doc-a.txt) vs 20k (aus doc-b.txt)" in out


def test_no_conflicts_section_when_empty():
    state = {
        "core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []},
        "dynamic_sections": [],
        "custom": {},
    }
    _result = render_briefing(_project_dict(), state, 1, [], documents_by_id={})
    out = _result.text
    assert "Konflikte" not in out


def test_unknown_source_id_renders_raw():
    state = {
        "core": {
            "contacts": [],
            "open_tasks": [
                {"id": "t1", "title": "Orphan", "source_document_ids": ["doc-missing"]}
            ],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
        "custom": {},
    }
    _result = render_briefing(_project_dict(), state, 1, [], documents_by_id={})
    out = _result.text
    assert "Quelle: doc-missing" in out


def test_decision_with_sources_renders_source_line():
    state = {
        "core": {
            "contacts": [],
            "open_tasks": [],
            "deadlines": [],
            "decisions": [
                {
                    "id": "d1",
                    "title": "Use Postgres",
                    "date": "2026-05-01",
                    "source_document_ids": ["doc-A"],
                }
            ],
            "blockers": [],
        },
        "dynamic_sections": [],
        "custom": {},
    }
    docs = {"doc-A": _doc("doc-A", "decision.md")}
    _result = render_briefing(_project_dict(), state, 1, [], documents_by_id=docs)
    out = _result.text
    assert "Use Postgres" in out
    assert "Quelle: decision.md" in out
