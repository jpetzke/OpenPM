from __future__ import annotations

import re
import uuid
from datetime import date as _date


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


def _assign_ids(items: list[dict]) -> list[dict]:
    for item in items:
        if not item.get("id"):
            item["id"] = str(uuid.uuid4())
    return items


def _ensure_sources(item: dict, document_id: str | None) -> None:
    """Ensure ``item`` has a non-empty ``source_document_ids`` list.

    If absent/empty, seed with ``[document_id]`` when available. A legacy
    singular ``source_document_id`` field (tasks) is folded into the
    list and then removed.
    """
    legacy_single = item.pop("source_document_id", None)
    existing = item.get("source_document_ids")
    if not isinstance(existing, list):
        existing = []
    if not existing and legacy_single:
        existing = [str(legacy_single)]
    if not existing and document_id is not None:
        existing = [str(document_id)]
    if existing:
        new_set = sorted({str(s) for s in existing})
        if new_set != item.get("source_document_ids"):
            item["source_document_ids"] = new_set
            if document_id is not None:
                item["last_modified_source"] = str(document_id)
        elif not item.get("source_document_ids"):
            item["source_document_ids"] = new_set


def _union_sources(existing: dict, incoming: dict) -> None:
    """Sorted set-union ``source_document_ids`` from ``incoming`` into ``existing``."""
    if not isinstance(incoming, dict):
        return
    incoming_sources = incoming.get("source_document_ids") or []
    if not incoming_sources and incoming.get("source_document_id"):
        incoming_sources = [incoming["source_document_id"]]
    if not incoming_sources:
        return
    merged = set(existing.get("source_document_ids") or [])
    merged.update(str(s) for s in incoming_sources)
    existing["source_document_ids"] = sorted(merged)


def merge_state(current_state: dict, delta: dict, document_id: str | None = None) -> dict:
    """Merge LLM-produced delta into current state. Returns new state dict.

    ``document_id``, when provided, is used to seed
    ``source_document_ids`` on freshly-introduced items that don't yet
    carry any sources of their own.
    """
    if not current_state:
        current_state = _empty_state()

    new_state = {
        "core": {
            "contacts": list(current_state.get("core", {}).get("contacts", [])),
            "open_tasks": list(current_state.get("core", {}).get("open_tasks", [])),
            "deadlines": list(current_state.get("core", {}).get("deadlines", [])),
            "decisions": list(current_state.get("core", {}).get("decisions", [])),
            "blockers": list(current_state.get("core", {}).get("blockers", [])),
        },
        "dynamic_sections": list(current_state.get("dynamic_sections", [])),
        "custom": dict(current_state.get("custom", {})),
    }
    _assign_ids(new_state["dynamic_sections"])
    for section in new_state["dynamic_sections"]:
        _assign_ids(section.get("items", []))

    core_delta = delta.get("core", {})

    # contacts: deduplicate by email (if present) else by name
    new_contacts = core_delta.get("contacts", [])
    _assign_ids(new_contacts)
    for nc in new_contacts:
        existing = _find_contact(new_state["core"]["contacts"], nc)
        if existing is not None:
            _union_sources(existing, nc)
            existing.update({k: v for k, v in nc.items() if v is not None and k != "source_document_ids"})
        else:
            _ensure_sources(nc, document_id)
            new_state["core"]["contacts"].append(nc)

    # open_tasks: append new, mark resolved
    new_tasks = core_delta.get("open_tasks", [])
    _assign_ids(new_tasks)
    for nt in new_tasks:
        _ensure_sources(nt, document_id)
    new_state["core"]["open_tasks"].extend(new_tasks)
    resolved_ids = set(delta.get("resolved_task_ids", []))
    for task in new_state["core"]["open_tasks"]:
        if task.get("id") in resolved_ids:
            task["status"] = "done"

    # deadlines: deduplicate by title+date
    new_deadlines = core_delta.get("deadlines", [])
    _assign_ids(new_deadlines)
    for nd in new_deadlines:
        existing = _find_by_title_date(new_state["core"]["deadlines"], nd)
        if existing is not None:
            _union_sources(existing, nd)
            existing.update({k: v for k, v in nd.items() if v is not None and k != "source_document_ids"})
        else:
            _ensure_sources(nd, document_id)
            new_state["core"]["deadlines"].append(nd)

    # decisions: always append (historical)
    new_decisions = core_delta.get("decisions", [])
    _assign_ids(new_decisions)
    for nd in new_decisions:
        _ensure_sources(nd, document_id)
    new_state["core"]["decisions"].extend(new_decisions)

    # blockers: append new, remove resolved
    new_blockers = core_delta.get("blockers", [])
    _assign_ids(new_blockers)
    for nb in new_blockers:
        _ensure_sources(nb, document_id)
    removed_ids = set(delta.get("removed_blocker_ids", []))
    new_state["core"]["blockers"] = [b for b in new_state["core"]["blockers"] if b.get("id") not in removed_ids]
    new_state["core"]["blockers"].extend(new_blockers)

    # dynamic sections: merge by title/kind, append new items
    current_sections = new_state.get("dynamic_sections", [])
    incoming_sections = delta.get("dynamic_sections", [])
    _assign_ids(incoming_sections)
    for section in incoming_sections:
        items = section.get("items", [])
        _assign_ids(items)
        existing = _find_dynamic_section(current_sections, section)
        if existing is None:
            if not section.get("source_document_ids") and document_id is not None:
                section["source_document_ids"] = [str(document_id)]
            for item in items:
                _ensure_sources(item, document_id)
            current_sections.append(section)
            continue

        existing["title"] = section.get("title") or existing.get("title")
        existing["kind"] = section.get("kind") or existing.get("kind")
        if section.get("source_document_ids"):
            existing_sources = set(existing.get("source_document_ids", []))
            existing_sources.update(section.get("source_document_ids", []))
            existing["source_document_ids"] = sorted(existing_sources)
        elif document_id is not None and not existing.get("source_document_ids"):
            existing["source_document_ids"] = [str(document_id)]
        existing_items = existing.setdefault("items", [])
        for item in items:
            match = _find_dynamic_item(existing_items, item)
            if match is not None:
                _union_sources(match, item)
                match.update({k: v for k, v in item.items() if v is not None and k != "source_document_ids"})
            else:
                _ensure_sources(item, document_id)
                existing_items.append(item)

    # custom: shallow merge
    custom_delta = delta.get("custom", {})
    new_state["custom"].update(custom_delta)

    new_state["conflicts"] = detect_conflicts(new_state)

    return new_state


# ---------------------------------------------------------------------------
# Conflict detection
# ---------------------------------------------------------------------------

# Per-type key fields whose disagreement constitutes a conflict.
_CONFLICT_FIELDS: dict[str, tuple[str, ...]] = {
    "task": ("due_date", "status"),
    "contact": ("email", "role"),
    "deadline": ("date",),
    "decision": ("summary", "date"),
    "blocker": ("description",),
}

_CONFLICT_TYPE_BY_KEY = {
    "open_tasks": "task",
    "contacts": "contact",
    "deadlines": "deadline",
    "decisions": "decision",
    "blockers": "blocker",
}


def _norm(s: object) -> str:
    if not isinstance(s, str):
        return ""
    return " ".join(s.lower().strip().split())


def _item_title(item: dict, item_type: str) -> str:
    if item_type == "contact":
        return item.get("name") or item.get("title") or ""
    return item.get("title") or item.get("name") or ""


def _item_source_ids(item: dict) -> list[str]:
    sources = item.get("source_document_ids") or []
    if not sources and item.get("source_document_id"):
        sources = [item["source_document_id"]]
    return [str(s) for s in sources]


def _first_source(item: dict) -> str:
    sources = _item_source_ids(item)
    return sources[0] if sources else "unknown"


def detect_conflicts(state: dict) -> list[dict]:
    """Find items with same normalised title but divergent key fields.

    Returns a list of briefing-compatible conflict dicts:

    ``{type, title, field, a: {id, field, value, source_filename},
       b: {id, field, value, source_filename}}``

    Dynamic_section items are skipped (out of scope for the first cut).
    """
    if not isinstance(state, dict):
        return []
    core = state.get("core") or {}
    conflicts: list[dict] = []

    for key, item_type in _CONFLICT_TYPE_BY_KEY.items():
        items = core.get(key) or []
        if not isinstance(items, list):
            continue

        groups: dict[str, list[dict]] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            title = _item_title(item, item_type)
            norm = _norm(title)
            if not norm:
                continue
            groups.setdefault(norm, []).append(item)

        for norm_title, group in groups.items():
            if len(group) < 2:
                continue
            display_title = _item_title(group[0], item_type) or norm_title
            for field in _CONFLICT_FIELDS[item_type]:
                values = [item.get(field) for item in group]
                # Only counts as a conflict if at least two items disagree on
                # a non-null value.
                non_null = [v for v in values if v not in (None, "")]
                if len(set(non_null)) < 2:
                    continue
                # Pick the two items whose values diverge.
                a_item = None
                b_item = None
                for item in group:
                    val = item.get(field)
                    if val in (None, ""):
                        continue
                    if a_item is None:
                        a_item = item
                        continue
                    if item.get(field) != a_item.get(field):
                        b_item = item
                        break
                if a_item is None or b_item is None:
                    continue
                conflicts.append({
                    "type": item_type,
                    "title": display_title,
                    "field": field,
                    "a": {
                        "id": a_item.get("id"),
                        "field": field,
                        "value": a_item.get(field),
                        "source_document_ids": _item_source_ids(a_item),
                        "source_filename": "",
                    },
                    "b": {
                        "id": b_item.get("id"),
                        "field": field,
                        "value": b_item.get(field),
                        "source_document_ids": _item_source_ids(b_item),
                        "source_filename": "",
                    },
                })

    return conflicts


def compute_delta(old_state: dict, new_state: dict) -> dict:
    """Compute a simple delta between two states for changelog."""
    old_core = old_state.get("core", {}) if old_state else {}
    new_core = new_state.get("core", {})

    added: dict = {}
    removed: dict = {}

    for key in ["contacts", "open_tasks", "deadlines", "decisions", "blockers"]:
        old_ids = {i.get("id") for i in old_core.get(key, [])}
        new_ids = {i.get("id") for i in new_core.get(key, [])}

        newly_added = [i for i in new_core.get(key, []) if i.get("id") not in old_ids]
        newly_removed = [i for i in old_core.get(key, []) if i.get("id") not in new_ids]

        if newly_added:
            added[f"core.{key}"] = newly_added
        if newly_removed:
            removed[f"core.{key}"] = newly_removed

    old_sections = {section.get("id"): section for section in old_state.get("dynamic_sections", [])} if old_state else {}
    new_sections = {section.get("id"): section for section in new_state.get("dynamic_sections", [])}

    added_sections = [section for sid, section in new_sections.items() if sid not in old_sections]
    removed_sections = [section for sid, section in old_sections.items() if sid not in new_sections]
    modified_sections = []
    for sid, section in new_sections.items():
        old_section = old_sections.get(sid)
        if old_section is None:
            continue
        if old_section != section:
            modified_sections.append(section)

    if added_sections:
        added["dynamic_sections"] = added_sections
    if removed_sections:
        removed["dynamic_sections"] = removed_sections
    modified = {"dynamic_sections": modified_sections} if modified_sections else {}

    return {"added": added, "modified": modified, "removed": removed}


def compute_next_deadline(state: dict) -> dict | None:
    """Return {deadline, is_overdue} for the next relevant deadline, or None.

    Filters out resolved items, prefers upcoming deadlines (sorted by date ASC
    then title ASC), falls back to overdue (same sort). Returns None when
    state has no parseable, non-resolved deadlines.
    """
    core = state.get("core") if isinstance(state, dict) else None
    if not core:
        return None
    deadlines = core.get("deadlines") or []
    today = _date.today()

    upcoming: list[tuple[_date, str, dict]] = []
    overdue: list[tuple[_date, str, dict]] = []

    for item in deadlines:
        if not isinstance(item, dict):
            continue
        if item.get("status") == "resolved":
            continue
        raw = item.get("date")
        if not raw:
            continue
        try:
            d = _date.fromisoformat(str(raw))
        except (ValueError, TypeError):
            continue
        title = str(item.get("title") or "")
        if d >= today:
            upcoming.append((d, title, item))
        else:
            overdue.append((d, title, item))

    if upcoming:
        upcoming.sort(key=lambda x: (x[0], x[1]))
        return {"deadline": upcoming[0][2], "is_overdue": False}
    if overdue:
        overdue.sort(key=lambda x: (x[0], x[1]))
        return {"deadline": overdue[0][2], "is_overdue": True}
    return None


def _find_contact(contacts: list[dict], new_contact: dict) -> dict | None:
    email = new_contact.get("email")
    name = new_contact.get("name")
    for c in contacts:
        if email and c.get("email") == email:
            return c
        if not email and name and c.get("name") == name:
            return c
    return None


def _find_by_title_date(items: list[dict], new_item: dict) -> dict | None:
    for i in items:
        if i.get("title") == new_item.get("title") and i.get("date") == new_item.get("date"):
            return i
    return None


def _find_dynamic_section(sections: list[dict], new_section: dict) -> dict | None:
    section_id = new_section.get("id")
    title = (new_section.get("title") or "").strip().lower()
    kind = (new_section.get("kind") or "").strip().lower()
    for section in sections:
        if section_id and section.get("id") == section_id:
            return section
        if title and kind and section.get("title", "").strip().lower() == title and section.get("kind", "").strip().lower() == kind:
            return section
    return None


def _find_dynamic_item(items: list[dict], new_item: dict) -> dict | None:
    item_id = new_item.get("id")
    title = (new_item.get("title") or new_item.get("label") or "").strip().lower()
    for item in items:
        if item_id and item.get("id") == item_id:
            return item
        existing_title = (item.get("title") or item.get("label") or "").strip().lower()
        if title and existing_title == title:
            return item
    return None


def remove_document_source(state: dict, document_id: str) -> dict:
    """Remove all references to ``document_id`` from state item source lists.

    For each item across core sections and dynamic_sections:
    - Drop ``document_id`` from ``source_document_ids``.
    - If the resulting list is empty:
      - If ``last_modified_source`` matches ``chat:*`` or ``manual:*`` patterns
        → keep the item, set source to ``["orphaned:{document_id}"]``.
      - Otherwise → drop the item.

    Mutates ``state`` in-place and returns a summary dict.
    """
    removed_count = 0
    orphaned_count = 0
    retained_count = 0

    def _process_list(items: list) -> list:
        nonlocal removed_count, orphaned_count, retained_count
        kept = []
        for item in items:
            if not isinstance(item, dict):
                kept.append(item)
                continue
            sources = list(item.get("source_document_ids") or [])
            if document_id not in sources:
                kept.append(item)
                retained_count += 1
                continue
            sources = [s for s in sources if s != document_id]
            if sources:
                item["source_document_ids"] = sources
                kept.append(item)
                retained_count += 1
            else:
                lms = item.get("last_modified_source") or ""
                if _CHAT_MANUAL_RE.match(lms):
                    item["source_document_ids"] = [f"orphaned:{document_id}"]
                    kept.append(item)
                    orphaned_count += 1
                else:
                    removed_count += 1
        return kept

    core = state.get("core") or {}
    for key in ("contacts", "open_tasks", "deadlines", "decisions", "blockers"):
        if key in core:
            core[key] = _process_list(core[key])

    for section in state.get("dynamic_sections") or []:
        if "items" in section:
            section["items"] = _process_list(section["items"])

    return {"removed_count": removed_count, "orphaned_count": orphaned_count, "retained_count": retained_count}


_CHAT_MANUAL_RE = re.compile(r"^(chat|manual):.+")
