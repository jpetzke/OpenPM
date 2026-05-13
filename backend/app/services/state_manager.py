from __future__ import annotations

import uuid


def _empty_state() -> dict:
    return {
        "core": {
            "contacts": [],
            "open_tasks": [],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "custom": {},
    }


def _assign_ids(items: list[dict]) -> list[dict]:
    for item in items:
        if not item.get("id"):
            item["id"] = str(uuid.uuid4())
    return items


def merge_state(current_state: dict, delta: dict) -> dict:
    """Merge LLM-produced delta into current state. Returns new state dict."""
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
        "custom": dict(current_state.get("custom", {})),
    }

    core_delta = delta.get("core", {})

    # contacts: deduplicate by email (if present) else by name
    new_contacts = core_delta.get("contacts", [])
    _assign_ids(new_contacts)
    for nc in new_contacts:
        existing = _find_contact(new_state["core"]["contacts"], nc)
        if existing is not None:
            existing.update({k: v for k, v in nc.items() if v is not None})
        else:
            new_state["core"]["contacts"].append(nc)

    # open_tasks: append new, mark resolved
    new_tasks = core_delta.get("open_tasks", [])
    _assign_ids(new_tasks)
    new_state["core"]["open_tasks"].extend(new_tasks)
    resolved_ids = set(delta.get("resolved_task_ids", []))
    for task in new_state["core"]["open_tasks"]:
        if task.get("id") in resolved_ids:
            task["status"] = "done"

    # deadlines: deduplicate by title+date
    new_deadlines = core_delta.get("deadlines", [])
    _assign_ids(new_deadlines)
    for nd in new_deadlines:
        if not _find_by_title_date(new_state["core"]["deadlines"], nd):
            new_state["core"]["deadlines"].append(nd)

    # decisions: always append (historical)
    new_decisions = core_delta.get("decisions", [])
    _assign_ids(new_decisions)
    new_state["core"]["decisions"].extend(new_decisions)

    # blockers: append new, remove resolved
    new_blockers = core_delta.get("blockers", [])
    _assign_ids(new_blockers)
    removed_ids = set(delta.get("removed_blocker_ids", []))
    new_state["core"]["blockers"] = [b for b in new_state["core"]["blockers"] if b.get("id") not in removed_ids]
    new_state["core"]["blockers"].extend(new_blockers)

    # custom: shallow merge
    custom_delta = delta.get("custom", {})
    new_state["custom"].update(custom_delta)

    return new_state


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

    return {"added": added, "modified": {}, "removed": removed}


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
