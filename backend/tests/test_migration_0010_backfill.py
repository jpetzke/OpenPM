"""Tests for the 0010 state source_document_ids backfill helper."""

from __future__ import annotations

import importlib.util
import pathlib
import sys
import types

_HERE = pathlib.Path(__file__).resolve()
_REPO = _HERE.parent.parent
_MIGRATION_PATH = _REPO / "alembic" / "versions" / "0010_state_source_ids_backfill.py"


def _load_migration_module():
    """Import the 0010 migration as a standalone module.

    Alembic's normal loader executes versions through ``op``/``conn``
    context, but the pure helper function ``_backfill_state`` is module-
    level and safe to import. We stub the ``alembic`` package so the
    import line ``from alembic import op`` does not pull the real
    Alembic context machinery (which would require a configured Config).
    """
    if "alembic" not in sys.modules:
        fake_alembic = types.ModuleType("alembic")
        fake_alembic.op = types.SimpleNamespace(get_bind=lambda: None)
        sys.modules["alembic"] = fake_alembic
    spec = importlib.util.spec_from_file_location(
        "_migration_0010", str(_MIGRATION_PATH)
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_migration = _load_migration_module()
_backfill_state = _migration._backfill_state


def _empty_state() -> dict:
    return {
        "core": {
            "contacts": [],
            "open_tasks": [],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
        "custom": {},
    }


def test_three_versions_backfill_correctly():
    seen: dict = {}
    doc_a = "doc-a"
    doc_b = "doc-b"

    # Version 1 — triggered by doc A — adds T1, T2.
    v1 = _empty_state()
    v1["core"]["open_tasks"] = [
        {"id": "t1", "title": "Task one"},
        {"id": "t2", "title": "Task two"},
    ]
    v1_new = _backfill_state(v1, doc_a, seen)
    assert v1_new["core"]["open_tasks"][0]["source_document_ids"] == [doc_a]
    assert v1_new["core"]["open_tasks"][1]["source_document_ids"] == [doc_a]

    # Version 2 — triggered by doc B — T1, T2 still there, adds T3.
    v2 = _empty_state()
    v2["core"]["open_tasks"] = [
        {"id": "t1", "title": "Task one"},
        {"id": "t2", "title": "Task two"},
        {"id": "t3", "title": "Task three"},
    ]
    v2_new = _backfill_state(v2, doc_b, seen)
    by_id = {t["id"]: t for t in v2_new["core"]["open_tasks"]}
    assert by_id["t1"]["source_document_ids"] == [doc_a]
    assert by_id["t2"]["source_document_ids"] == [doc_a]
    assert by_id["t3"]["source_document_ids"] == [doc_b]

    # Version 3 — no trigger doc — adds T4 → legacy marker.
    v3 = _empty_state()
    v3["core"]["open_tasks"] = [
        {"id": "t1", "title": "Task one"},
        {"id": "t2", "title": "Task two"},
        {"id": "t3", "title": "Task three"},
        {"id": "t4", "title": "Task four"},
    ]
    v3_new = _backfill_state(v3, None, seen)
    by_id3 = {t["id"]: t for t in v3_new["core"]["open_tasks"]}
    assert by_id3["t1"]["source_document_ids"] == [doc_a]
    assert by_id3["t2"]["source_document_ids"] == [doc_a]
    assert by_id3["t3"]["source_document_ids"] == [doc_b]
    assert by_id3["t4"]["source_document_ids"] == ["legacy:pre-migration"]


def test_legacy_singular_source_document_id_promoted_and_removed():
    seen: dict = {}
    state = _empty_state()
    state["core"]["open_tasks"] = [
        {"id": "tX", "title": "Legacy task", "source_document_id": "doc-X"}
    ]
    new = _backfill_state(state, "doc-trigger", seen)
    [task] = new["core"]["open_tasks"]
    assert task["source_document_ids"] == ["doc-X"]
    assert "source_document_id" not in task


def test_idempotent_when_run_twice():
    seen: dict = {}
    state = _empty_state()
    state["core"]["open_tasks"] = [
        {"id": "t1", "title": "Task"},
    ]
    once = _backfill_state(state, "doc-a", seen)

    # Second run on the result, starting fresh seen — should not mutate
    # already-populated source_document_ids.
    seen2: dict = {}
    twice = _backfill_state(once, "doc-OTHER", seen2)
    assert twice["core"]["open_tasks"][0]["source_document_ids"] == ["doc-a"]


def test_all_core_types_backfilled():
    seen: dict = {}
    state = _empty_state()
    state["core"]["contacts"] = [{"id": "c1", "name": "Alice", "email": "a@b.c"}]
    state["core"]["deadlines"] = [{"id": "d1", "title": "Launch", "date": "2026-06-01"}]
    state["core"]["decisions"] = [{"id": "dec1", "title": "Use PG"}]
    state["core"]["blockers"] = [{"id": "b1", "title": "Auth"}]

    new = _backfill_state(state, "doc-Z", seen)
    assert new["core"]["contacts"][0]["source_document_ids"] == ["doc-Z"]
    assert new["core"]["deadlines"][0]["source_document_ids"] == ["doc-Z"]
    assert new["core"]["decisions"][0]["source_document_ids"] == ["doc-Z"]
    assert new["core"]["blockers"][0]["source_document_ids"] == ["doc-Z"]


def test_dynamic_section_items_backfilled():
    seen: dict = {}
    state = _empty_state()
    state["dynamic_sections"] = [
        {
            "id": "s1",
            "title": "Risks",
            "kind": "risks",
            "items": [{"id": "i1", "title": "Risk one"}],
        }
    ]
    new = _backfill_state(state, "doc-Y", seen)
    [section] = new["dynamic_sections"]
    [item] = section["items"]
    assert item["source_document_ids"] == ["doc-Y"]


def test_no_overwrite_when_sources_already_present():
    seen: dict = {}
    state = _empty_state()
    state["core"]["open_tasks"] = [
        {"id": "t1", "title": "Task", "source_document_ids": ["doc-EXISTING"]}
    ]
    new = _backfill_state(state, "doc-trigger", seen)
    assert new["core"]["open_tasks"][0]["source_document_ids"] == ["doc-EXISTING"]


def test_input_state_not_mutated():
    seen: dict = {}
    state = _empty_state()
    state["core"]["open_tasks"] = [{"id": "t1", "title": "Task"}]
    _ = _backfill_state(state, "doc-A", seen)
    assert "source_document_ids" not in state["core"]["open_tasks"][0]
