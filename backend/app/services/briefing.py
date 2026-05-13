from __future__ import annotations

import tiktoken

_ENCODING = tiktoken.get_encoding("cl100k_base")
TOKEN_BUDGET = 1200


def _count_tokens(text: str) -> int:
    return len(_ENCODING.encode(text))


def render_briefing(project: dict, state: dict, version: int, changelog_entries: list[dict]) -> str:
    """Render compiled briefing markdown. project is a dict with name/client_name/status/updated_at."""
    core = state.get("core", {})

    open_tasks = [t for t in core.get("open_tasks", []) if t.get("status", "open") != "done"]
    contacts = core.get("contacts", [])
    decisions = core.get("decisions", [])
    blockers = core.get("blockers", [])

    def _render(max_decisions: int, max_changelog: int, full_contacts: bool) -> str:
        lines = [
            f"## Projekt: {project['name']} | Kunde: {project['client_name']} | Status: {project['status']}",
            f"Stand: {project.get('updated_at', '')} | State-Version: {version}",
            "",
            f"### Offene Tasks ({len(open_tasks)})",
        ]
        for t in open_tasks:
            deadline = f" — fällig {t['deadline']}" if t.get("deadline") else ""
            lines.append(f"- [ ] {t['title']}{deadline}")

        lines += ["", f"### Kontakte ({len(contacts)})"]
        for c in contacts:
            if full_contacts:
                email = f" — {c['email']}" if c.get("email") else ""
                lines.append(f"- {c['name']} ({c.get('role', '')}){email}")
            else:
                lines.append(f"- {c['name']} ({c.get('role', '')})")

        recent_decisions = decisions[-max_decisions:] if decisions else []
        lines += ["", f"### Letzte Entscheidungen (max. {max_decisions})"]
        for d in recent_decisions:
            src = f" ({d.get('source_filename', '')})" if d.get("source_filename") else ""
            lines.append(f"- {d.get('date', '')}: {d['title']}{src}")

        lines += ["", "### Aktive Blocker"]
        for b in blockers:
            lines.append(f"- [{b.get('severity', 'medium')}] {b['title']}")

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
