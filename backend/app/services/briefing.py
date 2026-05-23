from __future__ import annotations

from typing import Any, Mapping

import tiktoken

_ENCODING = tiktoken.get_encoding("cl100k_base")
TOKEN_BUDGET = 1200


def _count_tokens(text: str) -> int:
    return len(_ENCODING.encode(text))


def _shorten_filename(name: str, max_len: int = 40) -> str:
    if len(name) <= max_len:
        return name
    head = max_len - 3
    return name[:head] + "..."


def _render_source_id(source_id: str, documents_by_id: Mapping[str, Any]) -> str:
    if not source_id:
        return ""
    if source_id.startswith("chat:"):
        return "aus Chat"
    if source_id.startswith("manual:"):
        return "manuell"
    if source_id == "legacy:pre-migration":
        return "Quelle vor Migration verloren"
    doc = documents_by_id.get(source_id)
    if doc is not None:
        filename = getattr(doc, "original_filename", None)
        if filename is None and isinstance(doc, Mapping):
            filename = doc.get("original_filename")
        if filename:
            return _shorten_filename(filename)
    return source_id


def _render_source(item: dict, documents_by_id: Mapping[str, Any]) -> str:
    ids = item.get("source_document_ids") or []
    if not ids and item.get("source_document_id"):
        ids = [item["source_document_id"]]
    rendered = [r for r in (_render_source_id(str(i), documents_by_id) for i in ids) if r]
    return ", ".join(rendered)


def render_briefing(
    project: dict,
    state: dict,
    version: int,
    changelog_entries: list[dict],
    documents_by_id: Mapping[str, Any] | None = None,
) -> str:
    """Render compiled briefing markdown.

    ``project`` is a dict with name/client_name/status/updated_at.
    ``documents_by_id`` maps a document id (string) to the ``Document``
    ORM row (or a dict with ``original_filename``). Used to render the
    ``_ (Quelle: ...)_`` line under each item.
    """
    documents_by_id = documents_by_id or {}
    core = state.get("core", {})

    open_tasks = [t for t in core.get("open_tasks", []) if t.get("status", "open") != "done"]
    contacts = core.get("contacts", [])
    decisions = core.get("decisions", [])
    blockers = core.get("blockers", [])
    deadlines = core.get("deadlines", [])
    conflicts = state.get("conflicts") or []

    def _source_line(item: dict) -> str | None:
        rendered = _render_source(item, documents_by_id)
        if not rendered:
            return None
        return f"  _ (Quelle: {rendered})_"

    def _append_with_source(lines: list[str], item: dict) -> None:
        src = _source_line(item)
        if src:
            lines.append(src)

    def _render(max_decisions: int, max_changelog: int, full_contacts: bool) -> str:
        lines = [
            f"## Projekt: {project['name']} | Kunde: {project['client_name']} | Status: {project['status']}",
            f"Stand: {project.get('updated_at', '')} | State-Version: {version}",
            "",
            f"### Offene Tasks ({len(open_tasks)})",
        ]
        for t in open_tasks:
            deadline = f" - fällig {t['deadline']}" if t.get("deadline") else ""
            lines.append(f"- [ ] {t.get('title', '')}{deadline}")
            _append_with_source(lines, t)

        lines += ["", f"### Kontakte ({len(contacts)})"]
        for c in contacts:
            if full_contacts:
                email = f" — {c['email']}" if c.get("email") else ""
                lines.append(f"- {c['name']} ({c.get('role', '')}){email}")
            else:
                lines.append(f"- {c['name']} ({c.get('role', '')})")
            _append_with_source(lines, c)

        if deadlines:
            lines += ["", f"### Deadlines ({len(deadlines)})"]
            for d in deadlines:
                date = f" — {d['date']}" if d.get("date") else ""
                lines.append(f"- {d.get('title', '')}{date}")
                _append_with_source(lines, d)

        recent_decisions = decisions[-max_decisions:] if decisions else []
        lines += ["", f"### Letzte Entscheidungen (max. {max_decisions})"]
        for d in recent_decisions:
            lines.append(f"- {d.get('date', '')}: {d.get('title', '')}")
            _append_with_source(lines, d)

        lines += ["", "### Aktive Blocker"]
        for b in blockers:
            label = b.get("title") or b.get("description", "")
            lines.append(f"- [{b.get('severity', 'medium')}] {label}")
            _append_with_source(lines, b)

        if conflicts:
            lines += ["", "## ⚠ Konflikte"]
            for conflict in conflicts:
                title = conflict.get("title") or conflict.get("field") or "Konflikt"
                a = conflict.get("a") or {}
                b = conflict.get("b") or {}
                field = a.get("field") or b.get("field") or conflict.get("field") or "Wert"
                a_value = a.get("value", "?")
                b_value = b.get("value", "?")
                a_src = a.get("source_filename") or _render_source(a, documents_by_id) or "unbekannt"
                b_src = b.get("source_filename") or _render_source(b, documents_by_id) or "unbekannt"
                lines.append(
                    f"- konfligierend: {title} — {field}: {a_value} (aus {a_src}) vs {b_value} (aus {b_src})"
                )

        shown_changelog = changelog_entries[:max_changelog]
        lines += ["", "### Letzte Änderungen"]
        for entry in shown_changelog:
            trigger = entry.get("triggered_by", "pipeline")
            lines.append(f"- Version {entry.get('to_version', '?')} via {trigger}")

        return "\n".join(lines)

    text = _render(5, 3, True)
    if _count_tokens(text) <= TOKEN_BUDGET:
        return text

    text = _render(3, 1, True)
    if _count_tokens(text) <= TOKEN_BUDGET:
        return text

    return _render(3, 1, False)
