from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Mapping

import tiktoken

log = logging.getLogger(__name__)

_ENCODING = tiktoken.get_encoding("cl100k_base")
TOKEN_BUDGET = 1200  # kept for backward compat; soft-limit is SOFT_LIMIT below
SOFT_LIMIT = 1000
HARD_CAP = 1500

DEFAULT_PRIORITY_ORDER: list[str] = [
    "blockers",
    "open_tasks",
    "deadlines",
    "decisions",
    "contacts",
    "custom",
    "dynamic_sections",
]

_VALID_SLOTS = set(DEFAULT_PRIORITY_ORDER)


@dataclass
class BriefingResult:
    text: str
    token_count: int
    was_truncated: bool


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
    priority_order: list[str] | None = None,
) -> BriefingResult:
    """Render compiled briefing markdown.

    ``project`` is a dict with name/client_name/status/updated_at.
    ``documents_by_id`` maps a document id (string) to the ``Document``
    ORM row (or a dict with ``original_filename``). Used to render the
    ``_ (Quelle: ...)_`` line under each item.

    Returns a :class:`BriefingResult` with ``text``, ``token_count``,
    and ``was_truncated``.
    """
    documents_by_id = documents_by_id or {}
    core = state.get("core", {})

    open_tasks = [t for t in core.get("open_tasks", []) if t.get("status", "open") != "done"]
    contacts = core.get("contacts", [])
    decisions = core.get("decisions", [])
    blockers = core.get("blockers", [])
    deadlines = core.get("deadlines", [])
    dynamic_sections = state.get("dynamic_sections") or []
    custom = state.get("custom") or {}
    conflicts = state.get("conflicts") or []

    # Validate and resolve priority order
    effective_order: list[str]
    if priority_order is None:
        effective_order = DEFAULT_PRIORITY_ORDER
    else:
        effective_order = []
        for slot in priority_order:
            if slot in _VALID_SLOTS:
                effective_order.append(slot)
            else:
                log.warning("briefing_unknown_priority_slot slot=%s", slot)

    def _source_line(item: dict) -> str | None:
        rendered = _render_source(item, documents_by_id)
        if not rendered:
            return None
        return f"  _ (Quelle: {rendered})_"

    def _append_with_source(lines: list[str], item: dict) -> None:
        src = _source_line(item)
        if src:
            lines.append(src)

    def _render_header() -> list[str]:
        return [
            f"## Projekt: {project['name']} | Kunde: {project['client_name']} | Status: {project['status']}",
            f"Stand: {project.get('updated_at', '')} | State-Version: {version}",
            "",
        ]

    def _render_conflicts_section() -> list[str]:
        if not conflicts:
            return []
        lines: list[str] = ["", "## ⚠ Konflikte"]
        for conflict in conflicts:
            title = conflict.get("title") or conflict.get("field") or "Konflikt"
            a = conflict.get("a") or {}
            b_part = conflict.get("b") or {}
            field = a.get("field") or b_part.get("field") or conflict.get("field") or "Wert"
            a_value = a.get("value", "?")
            b_value = b_part.get("value", "?")
            a_src = a.get("source_filename") or _render_source(a, documents_by_id) or "unbekannt"
            b_src = b_part.get("source_filename") or _render_source(b_part, documents_by_id) or "unbekannt"
            lines.append(
                f"- konfligierend: {title} — {field}: {a_value} (aus {a_src}) vs {b_value} (aus {b_src})"
            )
        return lines

    def _render_slot(slot: str) -> list[str]:
        lines: list[str] = []
        if slot == "blockers":
            lines += ["", f"### Aktive Blocker ({len(blockers)})"]
            for b in blockers:
                label = b.get("title") or b.get("description", "")
                lines.append(f"- [{b.get('severity', 'medium')}] {label}")
                _append_with_source(lines, b)
        elif slot == "open_tasks":
            # max 10, sorted by deadline asc (None last)
            sorted_tasks = sorted(
                open_tasks[:10] if len(open_tasks) > 10 else open_tasks,
                key=lambda t: t.get("deadline") or "9999-99-99",
            )
            lines += ["", f"### Offene Tasks ({len(open_tasks)})"]
            for t in sorted_tasks:
                deadline = f" - fällig {t['deadline']}" if t.get("deadline") else ""
                lines.append(f"- [ ] {t.get('title', '')}{deadline}")
                _append_with_source(lines, t)
        elif slot == "deadlines":
            # next 3 deadlines
            sorted_dl = sorted(
                deadlines,
                key=lambda d: d.get("date") or "9999-99-99",
            )[:3]
            if sorted_dl:
                lines += ["", f"### Deadlines ({len(deadlines)})"]
                for d in sorted_dl:
                    date = f" — {d['date']}" if d.get("date") else ""
                    lines.append(f"- {d.get('title', '')}{date}")
                    _append_with_source(lines, d)
        elif slot == "decisions":
            # last 5 chronological desc
            recent_decisions = decisions[-5:] if decisions else []
            lines += ["", f"### Letzte Entscheidungen ({len(decisions)})"]
            for d in reversed(recent_decisions):
                lines.append(f"- {d.get('date', '')}: {d.get('title', '')}")
                _append_with_source(lines, d)
        elif slot == "contacts":
            # top 5 by source-doc count
            sorted_contacts = sorted(
                contacts,
                key=lambda c: len(c.get("source_document_ids") or []),
                reverse=True,
            )[:5]
            lines += ["", f"### Kontakte ({len(contacts)})"]
            for c in sorted_contacts:
                email = f" — {c['email']}" if c.get("email") else ""
                lines.append(f"- {c['name']} ({c.get('role', '')}){email}")
                _append_with_source(lines, c)
        elif slot == "custom":
            if custom:
                lines += ["", "### Weitere Informationen"]
                for key, value in custom.items():
                    # ~50 tokens per field: truncate long values
                    val_str = str(value)
                    if _count_tokens(val_str) > 50:
                        val_str = val_str[:200] + "…"
                    lines.append(f"- **{key}**: {val_str}")
        elif slot == "dynamic_sections":
            for section in dynamic_sections:
                title = section.get("title", "")
                items = section.get("items") or []
                if not items:
                    continue
                lines += ["", f"### {title}"]
                for item in items[:3]:
                    if isinstance(item, dict):
                        label = item.get("title") or item.get("name") or str(item)
                    else:
                        label = str(item)
                    lines.append(f"- {label}")
        return lines

    # Build the briefing slot-by-slot with hard-cap enforcement
    header_lines = _render_header()
    conflict_lines = _render_conflicts_section()

    # Always-present footer (changelog)
    footer_lines: list[str] = ["", "### Letzte Änderungen"]
    for entry in changelog_entries[:3]:
        trigger = entry.get("triggered_by", "pipeline")
        footer_lines.append(f"- Version {entry.get('to_version', '?')} via {trigger}")

    # Fixed sections that always appear
    fixed_text = "\n".join(header_lines + conflict_lines + footer_lines)
    fixed_tokens = _count_tokens(fixed_text)

    slot_texts: list[str] = []
    slot_tokens_total = 0
    was_truncated = False

    for slot in effective_order:
        slot_lines = _render_slot(slot)
        if not slot_lines:
            continue
        slot_text = "\n".join(slot_lines)
        slot_tok = _count_tokens(slot_text)

        current_total = fixed_tokens + slot_tokens_total + slot_tok
        if current_total > HARD_CAP:
            was_truncated = True
            # Don't add this slot at all if it would blow the hard cap
            break

        slot_texts.append(slot_text)
        slot_tokens_total += slot_tok

        if fixed_tokens + slot_tokens_total > SOFT_LIMIT:
            # Soft limit reached — continue trying if more slots fit within hard cap
            was_truncated = True

    all_parts = header_lines + []
    for st in slot_texts:
        all_parts.append(st)
    all_parts += conflict_lines
    all_parts += footer_lines

    text = "\n".join(all_parts)
    token_count = _count_tokens(text)

    # Final hard-cap safety truncation (should not normally trigger)
    if token_count > HARD_CAP:
        was_truncated = True
        encoded = _ENCODING.encode(text)[:HARD_CAP]
        text = _ENCODING.decode(encoded)
        token_count = HARD_CAP

    return BriefingResult(text=text, token_count=token_count, was_truncated=was_truncated)
