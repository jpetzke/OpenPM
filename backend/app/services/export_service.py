"""Project export — briefing.md, chat session markdown, full ZIP snapshot.

Section U. Zero LLM. A ZIP snapshot is the *correct* export form for OpenPM
because the state lives on source-backlinks: without the original documents the
extracted state has no provenance. Layout (roadmap U):

    project-{slug}-{date}.zip
    ├── README.md
    ├── briefing.md
    ├── state.json
    ├── state-history.json
    ├── documents.csv
    ├── documents/{original-filename}
    └── chats/{session-title}-{date}.md
"""

from __future__ import annotations

import csv
import io
import re
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.project import Project
from app.models.state import ChatMessage, ChatSession, ProjectState, StateChangelog
from app.services import storage

log = structlog.get_logger()


def slugify(value: str) -> str:
    value = (value or "project").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "project"


def _date_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _json_default(obj: Any) -> str:
    if isinstance(obj, (datetime,)):
        return obj.isoformat()
    if isinstance(obj, uuid.UUID):
        return str(obj)
    return str(obj)


def _dumps(obj: Any) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False, indent=2, default=_json_default)


async def briefing_markdown(project: Project) -> str:
    """The rendered briefing. Falls back to a stub when none compiled yet."""
    if project.compiled_briefing and project.compiled_briefing.strip():
        return project.compiled_briefing
    return f"# {project.name}\n\n_Noch kein Briefing generiert — lade Dokumente hoch._\n"


def session_markdown(session: ChatSession, messages: list[ChatMessage]) -> str:
    title = session.title or "Chat"
    created = session.created_at.strftime("%Y-%m-%d %H:%M") if session.created_at else ""
    lines = [f"# {title}", "", f"_Erstellt: {created} · {len(messages)} Nachrichten_", ""]
    role_label = {"user": "🧑 User", "assistant": "🤖 Assistant", "tool": "🛠 Tool"}
    for m in messages:
        lines.append(f"### {role_label.get(m.role, m.role)}")
        ts = m.created_at.strftime("%Y-%m-%d %H:%M") if m.created_at else ""
        meta = ts
        if m.model:
            meta += f" · {m.model}"
        if m.state_version is not None:
            meta += f" · State v{m.state_version}"
        if meta:
            lines.append(f"_{meta}_")
        lines.append("")
        lines.append(m.content or "")
        if m.tool_calls:
            lines.append("")
            lines.append(f"```json\n{_dumps(m.tool_calls)}\n```")
        lines.append("")
    return "\n".join(lines)


async def _latest_state(project_id: uuid.UUID, db: AsyncSession) -> tuple[dict, int]:
    row = (
        await db.execute(
            select(ProjectState.state, ProjectState.version)
            .where(ProjectState.project_id == project_id)
            .order_by(ProjectState.version.desc())
            .limit(1)
        )
    ).one_or_none()
    if row is None:
        return {}, 0
    return row[0] or {}, row[1]


async def _state_history(project_id: uuid.UUID, db: AsyncSession) -> dict:
    versions = (
        await db.execute(
            select(ProjectState.version, ProjectState.state, ProjectState.created_at)
            .where(ProjectState.project_id == project_id)
            .order_by(ProjectState.version.asc())
        )
    ).all()
    changelog = (
        await db.execute(
            select(StateChangelog)
            .where(StateChangelog.project_id == project_id)
            .order_by(StateChangelog.created_at.asc())
        )
    ).scalars().all()
    return {
        "versions": [
            {"version": v, "state": s, "created_at": c} for v, s, c in versions
        ],
        "changelog": [
            {
                "from_version": r.from_version,
                "to_version": r.to_version,
                "triggered_by": r.triggered_by,
                "document_id": r.document_id,
                "delta": r.delta,
                "created_at": r.created_at,
            }
            for r in changelog
        ],
    }


async def build_zip(project: Project, db: AsyncSession) -> bytes:
    """Assemble the full project snapshot ZIP in memory and return its bytes."""
    project_id = project.id
    latest_state, latest_version = await _latest_state(project_id, db)
    history = await _state_history(project_id, db)

    documents = (
        await db.execute(
            select(Document)
            .where(Document.project_id == project_id, Document.archived_at.is_(None))
            .order_by(Document.uploaded_at.asc())
        )
    ).scalars().all()

    # source_count per doc = changelog rows it triggered.
    src_counts_rows = (
        await db.execute(
            select(StateChangelog.document_id, func.count(StateChangelog.id))
            .where(StateChangelog.project_id == project_id)
            .group_by(StateChangelog.document_id)
        )
    ).all()
    src_counts = {did: cnt for did, cnt in src_counts_rows if did is not None}

    sessions = (
        await db.execute(
            select(ChatSession)
            .where(ChatSession.project_id == project_id, ChatSession.archived_at.is_(None))
            .order_by(ChatSession.created_at.asc())
        )
    ).scalars().all()

    buf = io.BytesIO()
    used_names: set[str] = set()

    def _unique(name: str) -> str:
        base = name
        i = 1
        while name in used_names:
            stem, _, ext = base.rpartition(".")
            name = f"{stem}-{i}.{ext}" if stem else f"{base}-{i}"
            i += 1
        used_names.add(name)
        return name

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        readme = (
            f"# {project.name}\n\n"
            f"Vollständiger Projekt-Snapshot, exportiert am {_date_stamp()} (OpenPM).\n\n"
            "## Inhalt\n"
            "- `briefing.md` — kompiliertes Briefing\n"
            "- `state.json` — aktueller State (Version "
            f"{latest_version})\n"
            "- `state-history.json` — alle Versionen + Changelog\n"
            "- `documents.csv` — Dokument-Übersicht\n"
            "- `documents/` — Original-Dateien (Quelle jeder State-Information)\n"
            "- `chats/` — exportierte Chat-Sessions\n"
        )
        zf.writestr("README.md", readme)
        zf.writestr("briefing.md", await briefing_markdown(project))
        zf.writestr("state.json", _dumps(latest_state))
        zf.writestr("state-history.json", _dumps(history))

        # documents.csv
        csv_buf = io.StringIO()
        writer = csv.writer(csv_buf)
        writer.writerow(["id", "filename", "format", "uploaded_at", "source_count"])
        for d in documents:
            writer.writerow(
                [
                    str(d.id),
                    d.original_filename,
                    d.source_format or d.mime_type,
                    d.uploaded_at.isoformat() if d.uploaded_at else "",
                    src_counts.get(d.id, 0),
                ]
            )
        zf.writestr("documents.csv", csv_buf.getvalue())

        # original document bytes
        for d in documents:
            try:
                data = storage.get_document_bytes(d.original_path)
            except Exception as exc:  # noqa: BLE001
                log.warning("export_doc_missing", document_id=str(d.id), error=str(exc))
                continue
            arc = _unique(f"documents/{d.original_filename}")
            zf.writestr(arc, data)

        # chat sessions
        for s in sessions:
            msgs = (
                await db.execute(
                    select(ChatMessage)
                    .where(ChatMessage.session_id == s.id)
                    .order_by(ChatMessage.created_at.asc())
                )
            ).scalars().all()
            if not msgs:
                continue
            stamp = s.created_at.strftime("%Y-%m-%d") if s.created_at else _date_stamp()
            arc = _unique(f"chats/{slugify(s.title or 'chat')}-{stamp}.md")
            zf.writestr(arc, session_markdown(s, list(msgs)))

    return buf.getvalue()


def zip_filename(project: Project) -> str:
    return f"project-{slugify(project.name)}-{_date_stamp()}.zip"
