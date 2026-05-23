"""state source ids backfill

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-22 16:00:00.000000

Data migration: backfill ``source_document_ids`` arrays on all Core item
types (contacts, open_tasks, deadlines, decisions, blockers) and on
``dynamic_sections[].items``.

Rules per item (first occurrence within a project's version history, in
version ASC order):

- If the version row has ``triggered_by_document_id``, seed the item's
  ``source_document_ids`` with ``[str(triggered_by_document_id)]``.
- Otherwise seed with ``["legacy:pre-migration"]``.

Subsequent occurrences (same item id within the same project) keep the
sources they already have; if missing, the previously-seen sources are
copied forward.

For open_tasks the migration also folds the legacy singular
``source_document_id`` field into ``source_document_ids`` and removes
the old key.

Idempotent: existing non-empty ``source_document_ids`` are never
overwritten.

The actual mutation logic lives in :func:`_backfill_state` so it can be
unit-tested without spinning up Alembic.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from alembic import op
from sqlalchemy import text

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


log = logging.getLogger("alembic.0010")


_CORE_TYPES: tuple[str, ...] = (
    "contacts",
    "open_tasks",
    "deadlines",
    "decisions",
    "blockers",
)


def _item_key(item_type: str, item: dict[str, Any]) -> str | None:
    """Stable identity for an item used to recognize re-occurrences.

    Prefer ``id`` when present; fall back to title (or email for
    contacts) so legacy items without ids still get tracked.
    """
    if not isinstance(item, dict):
        return None
    raw_id = item.get("id")
    if raw_id:
        return f"id:{raw_id}"
    if item_type == "contacts":
        email = item.get("email")
        if email:
            return f"email:{email}"
        name = item.get("name")
        if name:
            return f"name:{name}"
        return None
    title = item.get("title") or item.get("label") or item.get("description")
    if title:
        return f"title:{title}"
    return None


def _seed_sources(triggered_by_doc_id: Any) -> list[str]:
    if triggered_by_doc_id is None:
        return ["legacy:pre-migration"]
    return [str(triggered_by_doc_id)]


def _apply_item(
    item_type: str,
    item: dict[str, Any],
    triggered_by_doc_id: Any,
    seen_for_type: dict[str, list[str]],
) -> None:
    """Mutate a single item dict in place, recording sources in ``seen``."""
    if not isinstance(item, dict):
        return

    # Fold legacy singular source_document_id (tasks) into the list.
    legacy_single = item.pop("source_document_id", None)
    existing = item.get("source_document_ids")
    if not isinstance(existing, list):
        existing = []

    if not existing and legacy_single:
        existing = [str(legacy_single)]

    key = _item_key(item_type, item)

    if existing:
        # Idempotent: keep what's there and remember it for later versions.
        if key is not None:
            seen_for_type[key] = list(existing)
        item["source_document_ids"] = existing
        return

    # No sources yet — pull forward from a previous version if we've seen
    # this item before; otherwise seed from the version's trigger doc.
    if key is not None and key in seen_for_type:
        sources = list(seen_for_type[key])
    else:
        sources = _seed_sources(triggered_by_doc_id)

    item["source_document_ids"] = sources
    if key is not None:
        seen_for_type[key] = list(sources)


def _backfill_state(
    state: dict[str, Any] | None,
    triggered_by_doc_id: Any,
    seen: dict[str, dict[str, list[str]]],
) -> dict[str, Any]:
    """Return a new state dict with ``source_document_ids`` backfilled.

    ``seen`` is per-project and mutated across calls so that later
    versions can inherit sources from earlier ones.
    """
    if not isinstance(state, dict):
        return state or {}

    new_state = json.loads(json.dumps(state))  # deep copy
    core = new_state.get("core") or {}
    if not isinstance(core, dict):
        core = {}
        new_state["core"] = core

    for item_type in _CORE_TYPES:
        items = core.get(item_type) or []
        if not isinstance(items, list):
            continue
        bucket = seen.setdefault(f"core.{item_type}", {})
        for item in items:
            _apply_item(item_type, item, triggered_by_doc_id, bucket)

    dynamic_sections = new_state.get("dynamic_sections") or []
    if isinstance(dynamic_sections, list):
        for section in dynamic_sections:
            if not isinstance(section, dict):
                continue
            section_key = section.get("id") or section.get("title") or "anon"
            bucket = seen.setdefault(f"dyn:{section_key}", {})
            items = section.get("items") or []
            if not isinstance(items, list):
                continue
            for item in items:
                _apply_item("dynamic", item, triggered_by_doc_id, bucket)

    return new_state


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        text(
            "SELECT id, project_id, version, state, triggered_by_document_id "
            "FROM project_state ORDER BY project_id, version"
        )
    ).all()

    seen_by_project: dict[Any, dict[str, dict[str, list[str]]]] = {}
    for row in rows:
        project_seen = seen_by_project.setdefault(row.project_id, {})
        new_state = _backfill_state(row.state, row.triggered_by_document_id, project_seen)
        conn.execute(
            text("UPDATE project_state SET state = CAST(:s AS jsonb) WHERE id = :id"),
            {"s": json.dumps(new_state), "id": row.id},
        )


def downgrade() -> None:
    log.warning(
        "0010_state_source_ids_backfill downgrade is a no-op: source_document_ids "
        "additions cannot be cleanly reversed (singular source_document_id was lost)."
    )
