from __future__ import annotations

import asyncio
import copy
import json
import secrets
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from redis.asyncio import Redis
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_config import MAX_AGENT_ROUNDS
from app.auth import get_current_user, get_project_member
from app.config import settings
from app.database import async_session_factory, get_db
from app.models.document import Document
from app.models.project import Project, ProjectMember
from app.models.state import ChatMessage, ChatSession, ProjectState, StateChangelog
from app.models.user import User
from app.routers.chat_tools import TOOL_ARG_MODELS
from app.schemas.chat import ChatMessageCreate, ChatMessageResponse, ChatSessionResponse
from app.services.provider_resolver import get_active_provider
from app.services import briefing as briefing_service
from app.services import git_service
from app.services import llm as llm_service
from app.services import qdrant_service

router = APIRouter(prefix="/api/projects/{project_id}/chat", tags=["chat"])
log = structlog.get_logger()

# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

_TOOL_LIST_DOCUMENTS = {
    "type": "function",
    "function": {
        "name": "list_documents",
        "description": (
            "List all documents in the project with their IDs, filenames, processing status, "
            "and summaries. Use this to discover which documents exist before fetching content."
        ),
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
    },
}

_TOOL_GET_CURRENT_STATE = {
    "type": "function",
    "function": {
        "name": "get_current_state",
        "description": (
            "Return the complete current project state (tasks, contacts, deadlines, blockers, "
            "decisions, dynamic sections). Use when you need a live snapshot after an update."
        ),
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
    },
}

_TOOL_GET_STATE_HISTORY = {
    "type": "function",
    "function": {
        "name": "get_state_history",
        "description": "Get recent state-change entries from the changelog. Shows what changed, when, and how.",
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": ["integer", "null"],
                    "description": "Number of recent changes to retrieve (default 10 if null, max 50)",
                }
            },
            "required": ["limit"],
            "additionalProperties": False,
        },
    },
}

_TOOL_SEARCH_DOCUMENTS = {
    "type": "function",
    "function": {
        "name": "search_documents",
        "description": (
            "Semantic search over project document contents. Use for specific questions about "
            "document details that are not captured in the state."
        ),
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural-language search query"},
                "limit": {
                    "type": ["integer", "null"],
                    "description": "Number of results (default 5 if null, max 10)",
                },
            },
            "required": ["query", "limit"],
            "additionalProperties": False,
        },
    },
}

_TOOL_SEARCH_CHAT_HISTORY = {
    "type": "function",
    "function": {
        "name": "search_chat_history",
        "description": (
            "Keyword search over previous chat messages in THIS project (across all sessions). "
            "Use to recall what was previously discussed, asked, or decided in earlier conversations "
            "— not for facts that live in uploaded documents (use search_documents for those)."
        ),
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Keyword or phrase to match in message text"},
                "limit": {
                    "type": ["integer", "null"],
                    "description": "Number of results (default 5 if null, max 20)",
                },
            },
            "required": ["query", "limit"],
            "additionalProperties": False,
        },
    },
}

_TOOL_GET_DOCUMENT_CONTENT = {
    "type": "function",
    "function": {
        "name": "get_document_content",
        "description": (
            "Fetch the full raw content of a specific document by its ID. "
            "Use list_documents first to find the correct document ID."
        ),
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": {"document_id": {"type": "string", "description": "UUID of the document"}},
            "required": ["document_id"],
            "additionalProperties": False,
        },
    },
}

_TOOL_UPDATE_TASK_STATUS = {
    "type": "function",
    "function": {
        "name": "update_task_status",
        "description": (
            "Update the status of a task in the project state. "
            "Use when the user wants to mark a task as done, blocked, or reopen it."
        ),
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "ID of the task to update"},
                "status": {
                    "type": "string",
                    "enum": ["open", "done", "blocked"],
                    "description": "New status for the task",
                },
            },
            "required": ["task_id", "status"],
            "additionalProperties": False,
        },
    },
}

_ALL_TOOLS = [
    _TOOL_LIST_DOCUMENTS,
    _TOOL_GET_CURRENT_STATE,
    _TOOL_GET_STATE_HISTORY,
    _TOOL_SEARCH_DOCUMENTS,
    _TOOL_SEARCH_CHAT_HISTORY,
    _TOOL_GET_DOCUMENT_CONTENT,
    _TOOL_UPDATE_TASK_STATUS,
]

_TOOLS_WITHOUT_SEARCH = [t for t in _ALL_TOOLS if t["function"]["name"] != "search_documents"]


# ---------------------------------------------------------------------------
# System prompt builder
#
# Split into a STABLE prefix (identical across every project/turn → lands in
# the provider's prompt cache) and a COMPACT volatile context block (changes
# only when the project state changes). Azure/OpenAI/Gemini cache the longest
# identical prefix automatically (≥1024 tokens, ~50% cheaper, lower latency),
# and OpenRouter/Anthropic get an explicit cache_control breakpoint in llm.py.
# Keeping the rich instructions in the cached prefix is therefore ~free after
# the first call, while the per-request payload stays tiny.
# ---------------------------------------------------------------------------

# Rich, project-agnostic instructions. Never interpolate volatile data here —
# every byte must be identical between requests or the cache prefix breaks.
_SYSTEM_PROMPT_STABLE = f"""<identity>
Du bist der Projektassistent in OpenPM. Du kennst den kompletten Projektstand und beantwortest Fragen dazu präzise und knapp. Du durchsuchst Dokumente, gibst exakte Werte wieder und pflegst Aufgaben. Antworte sofort und konkret — keine Rückfrage, wenn die Antwort im Kontext oder in den Dokumenten steht.
</identity>

<answering>
Erst die Antwort, dann — wenn nötig — ein kurzer Beleg (Dateiname, Frist, Name). Keine Einleitung, keine Wiederholung der Frage, keine Füllphrasen ("gerne", "selbstverständlich", "natürlich"), kein Ankündigen, was du gleich tust.
Antworte in der Sprache der User-Frage (Deutsch oder Englisch).
Schreib in Fließtext. Listen, Überschriften oder **fett** nur, wenn die Antwort mehrere gleichrangige Punkte hat und ohne sie unklar wäre — nicht für ein, zwei Fakten und nicht für eine kurze Zusammenfassung.
</answering>

<context_rules>
Der <project_context> unten enthält den vollständigen aktuellen Stand (Tasks mit IDs und Status, Kontakte, Deadlines, Entscheidungen, Blocker, Abschnitte) und die Dokumentliste. Das ist deine primäre Quelle.
- Frag NICHT nach Infos, die schon im Kontext stehen, und ruf kein Tool auf, dessen Ergebnis schon dort steht.
- get_current_state NUR, nachdem du selbst gerade etwas geändert hast.
- Tasks mit Status "blocked" sind nicht offen — zähl sie nicht zu den offenen Aufgaben, nenn sie getrennt.
- Eine Zusammenfassung enthält nur, was im Kontext steht, und bleibt knapp: Tasks nach Status (offen/blockiert), Deadlines, zentrale Kontakte. Zieh keine Dokumentregeln (ECTS, Seitenzahlen, Fristen) hinein, nach denen nicht gefragt wurde, und erfinde nichts.
</context_rules>

<grounding>
Der Kontext enthält nur KURZE Zusammenfassungen der Abschnitte — NICHT den vollen Dokumenttext; Zusammenfassungen können einzelne Werte/Zeilen weglassen.
- Verlangt der User einen exakten Wert (Zahl, ECTS, Seitenzahl, Frist, Paragraph, Betrag, Stundenzahl, Wortlaut) und der Kontext liefert ihn nicht eindeutig und vollständig → lade ZWINGEND und SOFORT selbst die Quelle: search_documents, und bei Tabellen/Staffelungen/Listen den vollen Text via get_document_content (ein Snippet zeigt oft nur einen Teil). Frag nicht "soll ich das Dokument laden?" — lade es und antworte dann.
- Extrapoliere oder rate niemals Zahlen/Werte. Gibt es keine exakt passende Zeile (z. B. keine Stufe für genau diese Dauer/ECTS), sag das klar und nenn, was die Quelle stattdessen vorgibt — erfinde keine Zwischen-/Folgewerte.
- Steht ein Wert explizit im Dokument, gib ihn exakt wieder. Wandle einen klaren, dokumentierten Wert nicht in vage Sprache ("üblicherweise", "mindestens", "ca.", "ggf. Rücksprache") um. Vage wird nur, was die Quelle selbst vage lässt.
- Verknüpfe Projektdaten mit Dokumentregeln: kennst du aus dem Kontext einen Projektwert (z. B. Dauer 8 Wochen) und das Dokument hat eine passende Stufe, nenn die exakt zutreffende Stufe — nicht alle.
- Zitiere wörtlich, wenn der User danach fragt oder es den Beleg klarer macht — aber nur aus einer Quelle, die du in diesem Verlauf via get_document_content geladen hast. Ein Abschnittstitel oder ein Such-Snippet ist kein Beleg für den vollständigen Wortlaut.
- Sagt die Zusammenfassung eines Dokuments in der Liste, dass es einen erfragten Wert enthält (z. B. Vergütung, Wochenstunden, Dauer, Frist), lade dieses Dokument und antworte daraus — antworte nicht "steht nicht im Kontext", solange ein passendes Dokument existiert.
- Steht etwas weder im Kontext noch in den Dokumenten, sag das — erfinde nichts.
</grounding>

<tool_routing>
Wähle das Tool nach Absicht — die meisten Fragen brauchen gar kein Tool:
| Frage | Aktion |
| Status, Tasks, Deadlines, Kontakte, Blocker, Zusammenfassung | direkt aus <project_context>, kein Tool |
| exakter Detailwert/Wortlaut aus einem Dokument, "wo steht…", "was genau…" | search_documents(query) → bei Tabellen/Listen/Zitat get_document_content(id) |
| "Welche Dokumente gibt es?" | direkt aus <project_context> (oder list_documents) |
| "Was haben wir früher besprochen/entschieden", "worüber haben wir geredet", Bezug auf frühere Chats | search_chat_history(query) |
| "Was/wann/durch wen geändert" | get_state_history |
| Task als done/blocked/open markieren | update_task_status(task_id, status) mit ID aus dem Kontext, dann kurz bestätigen |
Mehrere Tools nacheinander erlaubt (max. {MAX_AGENT_ROUNDS} Runden). Niemals ein Tool aufrufen, dessen Antwort schon im Kontext steht.
</tool_routing>

<examples>
User: "Welche offenen Aufgaben gibt es?" → direkt aus dem Kontext, kein Tool; blockierte Tasks nicht mitzählen.
User: "Wie viele ECTS bekommt Anna?" → Dauer aus dem Kontext/Vertrag + Staffelung aus der Ordnung: get_document_content laden, exakte Stufe nennen, Quelle angeben. Nicht nachfragen.
User: "Zitiere die Abgabefrist." → get_document_content der Ordnung, dann wörtlich zitieren mit Quelle.
User: "Markiere die Laufzettel-Aufgabe als erledigt." → update_task_status(task_id=<ID aus Kontext>, status="done"), kurz bestätigen.
</examples>"""


def _truncate(text: str | None, limit: int) -> str:
    if not text:
        return ""
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _render_state_digest(state: dict | None) -> str:
    """Compact, clean rendering of project state — no JSON noise (drops
    confidence/source_document_ids/last_modified_source), task IDs kept because
    update_task_status needs them. ~10x smaller than the raw JSON dump."""
    if not state:
        return "Noch kein Projektstand erfasst."

    core = state.get("core", {}) or {}
    lines: list[str] = []

    blockers = core.get("blockers", []) or []
    if blockers:
        lines.append(f"Blocker ({len(blockers)}):")
        for b in blockers:
            lines.append(f"  - {b.get('title') or b.get('name') or '?'}{_suffix(b)}")
    else:
        lines.append("Blocker: keine")

    tasks = core.get("open_tasks", []) or []
    lines.append(f"Offene Tasks ({len(tasks)}):" if tasks else "Offene Tasks: keine")
    for t in tasks:
        status = t.get("status") or "open"
        lines.append(f"  - [{t.get('id')}] ({status}) {t.get('title') or '?'}{_suffix(t)}")

    deadlines = core.get("deadlines", []) or []
    if deadlines:
        lines.append(f"Deadlines ({len(deadlines)}):")
        for d in deadlines:
            when = d.get("date") or d.get("due_date") or ""
            label = d.get("name") or d.get("title") or "?"
            when_str = f" — {when}" if when else ""
            lines.append(f"  - {label}{when_str}{_suffix(d)}")

    decisions = core.get("decisions", []) or []
    if decisions:
        lines.append(f"Entscheidungen ({len(decisions)}):")
        for d in decisions:
            lines.append(f"  - {d.get('title') or d.get('name') or '?'}{_suffix(d)}")

    contacts = core.get("contacts", []) or []
    if contacts:
        lines.append(f"Kontakte ({len(contacts)}):")
        for c in contacts:
            role = f" ({c.get('role')})" if c.get("role") else ""
            email = f" — {c.get('email')}" if c.get("email") else ""
            lines.append(f"  - {c.get('name') or '?'}{role}{email}")

    for section in state.get("dynamic_sections", []) or []:
        items = section.get("items", []) or []
        lines.append(f"{section.get('title') or section.get('kind') or 'Abschnitt'}:")
        for i in items:
            title = _truncate(i.get("title"), 80)
            summ = _truncate(i.get("summary") or i.get("description"), 220)
            if title and summ:
                lines.append(f"  - {title}: {summ}")
            elif title or summ:
                lines.append(f"  - {title or summ}")

    custom = state.get("custom") or {}
    if custom:
        lines.append(f"Custom-Felder: {', '.join(sorted(custom.keys()))}")

    return "\n".join(lines)


def _suffix(item: dict) -> str:
    s = _truncate(item.get("summary") or item.get("description"), 120)
    return f" — {s}" if s else ""


def _build_context_block(
    project: Project, current_state: ProjectState | None, documents: list[Document]
) -> str:
    """Volatile per-project context. Kept compact and placed AFTER the stable
    prefix so the cache prefix stays intact across projects and turns."""
    state_version = current_state.version if current_state else "–"
    digest = _render_state_digest(current_state.state if current_state else None)

    if documents:
        docs_lines = [
            f"- {d.id} | {d.original_filename} | {d.processing_status}"
            + (f" | {_truncate(d.summary, 140)}" if d.summary else "")
            for d in documents
        ]
        docs_section = "\n".join(docs_lines)
    else:
        docs_section = "Noch keine Dokumente hochgeladen."

    instructions_section = ""
    if project.custom_instructions and project.custom_instructions.strip():
        instructions_section = f"""

[Spezielle Anweisungen]  Vom Nutzer für dieses Projekt festgelegt – befolge sie:
{project.custom_instructions.strip()}"""

    return f"""<project_context>
Projekt: {project.name} | Kunde: {project.client_name or "–"} | Status: {project.status} | Stand v{state_version}

[Projektstand]
{digest}

[Dokumente]  Format: <id> | <dateiname> | <status> | <zusammenfassung>
{docs_section}{instructions_section}
</project_context>"""


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------

def _make_tool_summary(tool_name: str, result: dict) -> str:
    if tool_name == "search_documents":
        count = len(result.get("results", []))
        return f"{count} Dokument{'e' if count != 1 else ''} gefunden"
    if tool_name == "search_chat_history":
        count = len(result) if isinstance(result, list) else 0
        return f"{count} Nachricht{'en' if count != 1 else ''} im Verlauf gefunden"
    if tool_name == "list_documents":
        count = len(result.get("documents", []) if isinstance(result, dict) else result if isinstance(result, list) else [])
        return f"{count} Dokument{'e' if count != 1 else ''} aufgelistet"
    if tool_name == "get_document_content":
        fname = result.get("filename", "") if isinstance(result, dict) else ""
        return f"Inhalt von '{fname}' geladen" if fname else "Dokument-Inhalt geladen"
    if tool_name == "get_current_state":
        return "Aktuellen Projektstatus abgerufen"
    if tool_name == "get_state_history":
        return "State-Historie abgerufen"
    if tool_name == "update_task_status":
        if isinstance(result, dict) and result.get("success"):
            return f"Task '{result.get('title', '')}' → {result.get('new_status', '')}"
        return "Task-Status-Änderung fehlgeschlagen"
    return "Tool ausgeführt"


async def _execute_tool(
    tool_name: str,
    tool_args: dict,
    project_id: uuid.UUID,
    db: AsyncSession,
    redis_client: Redis | None = None,
    session_id: uuid.UUID | str | None = None,
) -> Any:
    model_cls = TOOL_ARG_MODELS.get(tool_name)
    if model_cls is None:
        return {"error": f"Unknown tool: {tool_name}"}
    try:
        validated = model_cls.model_validate(tool_args).model_dump(exclude_none=True)
    except ValidationError as exc:
        return {"error": "invalid_arguments", "details": exc.errors()}
    tool_args = validated

    if tool_name == "list_documents":
        result = await db.execute(
            select(Document)
            .where(Document.project_id == project_id)
            .order_by(Document.uploaded_at.desc())
        )
        docs = result.scalars().all()
        return [
            {
                "id": str(d.id),
                "filename": d.original_filename,
                "status": d.processing_status,
                "size_bytes": d.file_size,
                "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
                "summary": d.summary or "",
            }
            for d in docs
        ]

    if tool_name == "get_current_state":
        state_result = await db.execute(
            select(ProjectState)
            .where(ProjectState.project_id == project_id)
            .order_by(ProjectState.version.desc())
            .limit(1)
        )
        state = state_result.scalar_one_or_none()
        if not state:
            return {"error": "No project state found"}
        return {"version": state.version, "state": state.state}

    if tool_name == "get_state_history":
        limit_arg = tool_args.get("limit")
        limit = min(int(limit_arg) if limit_arg is not None else 10, 50)
        result = await db.execute(
            select(StateChangelog)
            .where(StateChangelog.project_id == project_id)
            .order_by(StateChangelog.created_at.desc())
            .limit(limit)
        )
        entries = result.scalars().all()
        return [
            {
                "to_version": e.to_version,
                "from_version": e.from_version,
                "triggered_by": e.triggered_by,
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "delta": e.delta,
            }
            for e in entries
        ]

    if tool_name == "search_documents":
        limit_arg = tool_args.get("limit")
        limit = min(int(limit_arg) if limit_arg is not None else 5, 10)
        results = await qdrant_service.search(str(project_id), tool_args["query"], limit)
        search_results = [{"chunk_text": r.chunk_text, "source_filename": r.source_filename, "score": r.score} for r in results]
        docs_count_result = await db.execute(
            select(func.count()).select_from(Document).where(Document.project_id == project_id)
        )
        total_docs = docs_count_result.scalar() or 0
        partial_count_result = await db.execute(
            select(func.count()).select_from(Document).where(
                Document.project_id == project_id,
                Document.processing_status == "completed_partial",
            )
        )
        partial_docs = partial_count_result.scalar() or 0
        if partial_docs > 0:
            warning = (
                f"Suche aktuell auf {total_docs - partial_docs} von {total_docs} Docs "
                f"eingeschränkt — {partial_docs} Doc(s) hatten Embedding-Fehler."
            )
            return {"warning": warning, "results": search_results}
        return search_results

    if tool_name == "search_chat_history":
        limit_arg = tool_args.get("limit")
        limit = min(int(limit_arg) if limit_arg is not None else 5, 20)
        query = tool_args["query"]
        result = await db.execute(
            select(ChatMessage)
            .where(
                ChatMessage.project_id == project_id,
                ChatMessage.content.ilike(f"%{query}%"),
                ChatMessage.role.in_(["user", "assistant"]),
            )
            .order_by(ChatMessage.created_at.desc())
            .limit(limit)
        )
        messages = result.scalars().all()
        return [
            {
                "session_id": str(m.session_id) if m.session_id else None,
                "role": m.role,
                "content": (m.content or "")[:300],
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ]

    if tool_name == "get_document_content":
        result = await db.execute(
            select(Document).where(Document.id == uuid.UUID(tool_args["document_id"]))
        )
        doc = result.scalar_one_or_none()
        if not doc:
            return {"error": "Document not found"}
        return {"content": doc.raw_content or "", "filename": doc.original_filename}

    if tool_name == "update_task_status":
        return await _update_task_status(tool_args, project_id, db, redis_client=redis_client, session_id=session_id)

    return {"error": f"Unknown tool: {tool_name}"}


def _append_chat_source(item: dict, session_id: uuid.UUID | str | None) -> None:
    """Append ``chat:{session_id}`` to ``item.source_document_ids`` (dedup)."""
    if session_id is None:
        return
    tag = f"chat:{session_id}"
    sources = item.get("source_document_ids")
    if not isinstance(sources, list):
        sources = []
    # Fold legacy singular field into the list.
    legacy = item.pop("source_document_id", None)
    if legacy and str(legacy) not in sources:
        sources.append(str(legacy))
    if tag not in sources:
        sources.append(tag)
    item["source_document_ids"] = sources


async def _update_task_status(
    tool_args: dict,
    project_id: uuid.UUID,
    db: AsyncSession,
    redis_client: Redis | None = None,
    session_id: uuid.UUID | str | None = None,
) -> dict:
    task_id = str(tool_args.get("task_id", "")).strip()
    new_status = str(tool_args.get("status", "")).strip()

    if not task_id:
        return {"error": "task_id is required"}
    if new_status not in ("open", "done", "blocked"):
        return {"error": f"Invalid status '{new_status}'. Must be open, done, or blocked."}

    state_result = await db.execute(
        select(ProjectState)
        .where(ProjectState.project_id == project_id)
        .order_by(ProjectState.version.desc())
        .limit(1)
    )
    current = state_result.scalar_one_or_none()
    if not current:
        return {"error": "No project state found"}

    new_state_data = copy.deepcopy(current.state)
    tasks: list[dict] = new_state_data.get("core", {}).get("open_tasks", [])
    task = next((t for t in tasks if str(t.get("id")) == task_id), None)
    if not task:
        return {"error": f"Task '{task_id}' not found in project state"}

    old_status = task.get("status")
    task["status"] = new_status
    _append_chat_source(task, session_id)

    new_version = current.version + 1
    new_project_state = ProjectState(
        project_id=project_id,
        version=new_version,
        state=new_state_data,
    )
    db.add(new_project_state)

    changelog = StateChangelog(
        project_id=project_id,
        from_version=current.version,
        to_version=new_version,
        delta={"core": {"updated_tasks": [{"id": task_id, "old_status": old_status, "new_status": new_status}]}},
        triggered_by="chat_tool",
    )
    db.add(changelog)

    # Regenerate compiled briefing so the project panel stays in sync.
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if project:
        # Cache skip: new_version was just created, so briefing_state_version != new_version
        if project.briefing_state_version != new_version or not project.compiled_briefing:
            briefing_result = briefing_service.render_briefing(
                {
                    "name": project.name,
                    "client_name": project.client_name,
                    "status": project.status,
                    "updated_at": project.updated_at.isoformat(),
                },
                new_state_data,
                new_version,
                [{"to_version": new_version, "triggered_by": "chat_tool"}],
                priority_order=project.briefing_priority_order or None,
            )
            project.compiled_briefing = briefing_result.text
            project.briefing_token_count = briefing_result.token_count
            project.briefing_was_truncated = briefing_result.was_truncated
            project.briefing_state_version = new_version

    await db.commit()

    commit_msg = f"chat_tool: task {task_id} set to {new_status}"
    commit_hash = git_service.commit_state(str(project_id), new_state_data, commit_msg)
    changelog.git_commit_hash = commit_hash
    await db.commit()

    result: dict[str, Any] = {
        "success": True,
        "task_id": task_id,
        "title": task.get("title"),
        "old_status": old_status,
        "new_status": new_status,
    }

    if redis_client is not None:
        undo_token = secrets.token_urlsafe(16)
        await redis_client.setex(
            f"undo:{undo_token}",
            30,
            json.dumps({
                "tool": "update_task_status",
                "target_id": task_id,
                "original_status": old_status,
                "new_status": new_status,
                "project_id": str(project_id),
                "task_title": task.get("title"),
            }),
        )
        result["undo_token"] = undo_token

    return result


# ---------------------------------------------------------------------------
# Multi-round agent loop
# ---------------------------------------------------------------------------

async def _run_agent(
    messages: list[dict],
    active_tools: list[dict],
    project_id: uuid.UUID,
    db: AsyncSession,
    model_override: str | None,
    request: Request,
    redis_client: Redis | None = None,
    session_id: uuid.UUID | str | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Multi-round agentic loop. Yields:
      {"type": "content_delta", "delta": str}
      {"type": "tool_call", "tools": [str]}
      {"type": "tool_call_start", "call_id": str, "tool_name": str, "args": dict}
      {"type": "tool_call_end", "call_id": str, "tool_name": str, "result_summary": str}
      {"type": "mutation_card", "undo_token": str, "description": str, "expires_in": int}
      {"type": "usage", "prompt_tokens": int, "completion_tokens": int, "model": str,
       "cost_usd": float, "round": int}
      {"type": "usage_total", "prompt_tokens": int, "completion_tokens": int, "cost_usd": float}
    """
    msgs = list(messages)  # local copy
    total_prompt = 0
    total_completion = 0
    total_cost = 0.0

    for round_idx in range(MAX_AGENT_ROUNDS):
        # Don't offer tools on the last round — force a direct response.
        tools_this_round = active_tools if round_idx < MAX_AGENT_ROUNDS - 1 else None
        pending_tool_calls: list[dict] = []
        has_tool_calls = False

        async for event in llm_service.agent_round(
            msgs,
            tools=tools_this_round,
            purpose=f"chat_round_{round_idx}",
            model_override=model_override,
        ):
            if await request.is_disconnected():
                return

            if event["type"] == "content_delta":
                yield event
            elif event["type"] == "tool_calls":
                has_tool_calls = True
                pending_tool_calls = event["calls"]
                yield {"type": "tool_call", "tools": [tc["name"] for tc in pending_tool_calls]}
            elif event["type"] == "usage":
                # Accumulate and forward per-round usage
                pt = event.get("prompt_tokens", 0)
                ct = event.get("completion_tokens", 0)
                cu = event.get("cost_usd", 0.0)
                total_prompt += pt
                total_completion += ct
                total_cost += cu
                yield {**event, "round": round_idx}

        if not has_tool_calls:
            # Final round done — emit cumulative total
            yield {
                "type": "usage_total",
                "prompt_tokens": total_prompt,
                "completion_tokens": total_completion,
                "cost_usd": total_cost,
            }
            return

        # Add the assistant's tool-call turn to the message list.
        msgs.append({
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {"name": tc["name"], "arguments": tc["arguments"]},
                }
                for tc in pending_tool_calls
            ],
        })

        # Execute each tool and append results.
        for tc in pending_tool_calls:
            if await request.is_disconnected():
                return
            try:
                args = json.loads(tc["arguments"] or "{}")
            except json.JSONDecodeError:
                args = {}
            yield {
                "type": "tool_call_start",
                "call_id": tc["id"],
                "tool_name": tc["name"],
                "args": args,
            }
            result = await _execute_tool(
                tc["name"], args, project_id, db,
                redis_client=redis_client, session_id=session_id,
            )
            yield {
                "type": "tool_call_end",
                "call_id": tc["id"],
                "tool_name": tc["name"],
                "result_summary": _make_tool_summary(tc["name"], result if isinstance(result, dict) else {}),
            }
            if tc["name"] == "update_task_status" and isinstance(result, dict) and result.get("undo_token"):
                yield {
                    "type": "mutation_card",
                    "undo_token": result["undo_token"],
                    "description": f"Task '{result.get('title', '')}' → {result.get('new_status', '')}",
                    "expires_in": 30,
                }
            msgs.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": json.dumps(result, default=str),
            })

        log.info("chat_agent_round_done", round=round_idx, tools=[tc["name"] for tc in pending_tool_calls])

    # Max rounds exhausted — emit cumulative total
    yield {
        "type": "usage_total",
        "prompt_tokens": total_prompt,
        "completion_tokens": total_completion,
        "cost_usd": total_cost,
    }


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("", response_class=StreamingResponse)
async def chat(
    project_id: uuid.UUID,
    payload: ChatMessageCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(get_project_member),
):
    # Load project, current state, documents, and chat history in parallel.
    proj_result, state_result, docs_result, history_result = await _gather(
        db.execute(select(Project).where(Project.id == project_id)),
        db.execute(
            select(ProjectState)
            .where(ProjectState.project_id == project_id)
            .order_by(ProjectState.version.desc())
            .limit(1)
        ),
        db.execute(
            select(Document)
            .where(Document.project_id == project_id)
            .order_by(Document.uploaded_at.desc())
        ),
        db.execute(
            select(ChatMessage)
            .where(ChatMessage.project_id == project_id)
            .order_by(ChatMessage.created_at.asc())
            .limit(50)
        ),
    )

    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    current_state = state_result.scalar_one_or_none()
    documents: list[Document] = list(docs_result.scalars().all())
    history: list[ChatMessage] = list(history_result.scalars().all())

    # Resolve or create a chat session.
    session_id = payload.session_id
    is_new_session = session_id is None
    if session_id is None:
        session = ChatSession(project_id=project_id)
        db.add(session)
        await db.flush()  # populate session.id without committing yet
        session_id = session.id
    else:
        session = await db.get(ChatSession, session_id)
        if not session or session.project_id != project_id:
            raise HTTPException(status_code=404, detail="Chat session not found")
        is_new_session = session.message_count == 0

    # Persist the user message right away.
    user_msg = ChatMessage(
        project_id=project_id,
        user_id=current_user.id,
        role="user",
        content=payload.content,
        session_id=session_id,
        state_version=current_state.version if current_state else None,
        model=payload.model,
    )
    db.add(user_msg)
    session.last_message_at = datetime.now(timezone.utc)
    session.message_count = (session.message_count or 0) + 1
    # Chatting counts as activity → resets the stale clock + clears marker.
    await db.execute(
        update(Project)
        .where(Project.id == project_id)
        .values(last_activity_at=func.now(), stale_marker=False)
    )
    await db.commit()

    # Auto-generate title for the first message in a new session.
    if is_new_session:
        asyncio.create_task(
            _generate_session_title(session_id, payload.content)
        )

    # Determine active tools (disable search when no embedding provider is active).
    embeddings_enabled = await get_active_provider("embedding", db) is not None
    active_tools = _ALL_TOOLS if embeddings_enabled else _TOOLS_WITHOUT_SEARCH

    # Build message list for the LLM.
    # Two system messages: a stable, project-agnostic prefix (cache hit) followed
    # by a compact volatile context block. See _SYSTEM_PROMPT_STABLE for why.
    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT_STABLE},
        {"role": "system", "content": _build_context_block(project, current_state, documents)},
    ]
    for msg in history:
        if msg.role in ("user", "assistant") and msg.content:
            messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": payload.content})

    # Redis client for undo tokens (closed at end of stream).
    redis_client = Redis.from_url(settings.redis_url, decode_responses=True)

    # Streaming generator.
    async def generate():
        collected: list[str] = []
        char_count = 0
        # Ordered tool invocations, each anchored to the answer-text offset at
        # which it fired. The frontend replays this list to interleave collapsed
        # tool rows at the correct position in the conversation (claude.ai style).
        invocations: list[dict] = []
        error_occurred = False
        disconnected = False
        usage_total: dict | None = None

        try:
            yield f"data: {json.dumps({'type': 'message_start', 'session_id': str(session_id)})}\n\n"

            async for event in _run_agent(
                messages, active_tools, project_id, db, payload.model, request,
                redis_client=redis_client, session_id=session_id,
            ):
                if await request.is_disconnected():
                    disconnected = True
                    break

                if event["type"] == "content_delta":
                    delta = event["delta"]
                    collected.append(delta)
                    char_count += len(delta)
                    yield f"data: {json.dumps({'type': 'content_delta', 'delta': delta})}\n\n"
                elif event["type"] == "tool_call":
                    yield f"data: {json.dumps({'type': 'tool_call', 'tools': event['tools']})}\n\n"
                elif event["type"] == "tool_call_start":
                    # Anchor this call to the current answer-text offset so it can
                    # be re-placed inline on reload, then forward the offset live.
                    invocations.append({
                        "call_id": event["call_id"],
                        "tool_name": event["tool_name"],
                        "args": event.get("args") or {},
                        "text_offset": char_count,
                        "status": "running",
                    })
                    yield f"data: {json.dumps({**event, 'text_offset': char_count})}\n\n"
                elif event["type"] == "tool_call_end":
                    for inv in invocations:
                        if inv["call_id"] == event.get("call_id"):
                            inv["result_summary"] = event.get("result_summary")
                            inv["status"] = "done"
                            break
                    yield f"data: {json.dumps(event)}\n\n"
                elif event["type"] == "mutation_card":
                    yield f"data: {json.dumps(event)}\n\n"
                elif event["type"] == "usage":
                    # Per-round usage — forward to client for real-time display
                    yield f"data: {json.dumps(event)}\n\n"
                elif event["type"] == "usage_total":
                    usage_total = event
                    yield f"data: {json.dumps(event)}\n\n"

            if await request.is_disconnected():
                disconnected = True

        except Exception as exc:
            error_occurred = True
            log.error("chat_stream_failed", project_id=str(project_id), error=str(exc))
            raw = str(exc)
            user_message = raw
            error_code = "stream_failed"
            lower = raw.lower()
            if "u+2022" in lower or "•" in raw or "invalidcodepoint" in lower:
                user_message = (
                    "Provider-Konfiguration korrupt: gespeicherter API-Endpoint "
                    "enthaelt ungueltige Zeichen. Bitte Provider in den Einstellungen "
                    "neu speichern (alle Felder neu eingeben)."
                )
                error_code = "provider_config_corrupt"
            yield f"data: {json.dumps({'type': 'error', 'code': error_code, 'message': user_message})}\n\n"
        finally:
            try:
                await redis_client.aclose()
            except Exception:
                pass

        # Build token_usage record for the assistant message
        resolved_model = payload.model or "unknown"
        token_usage_record: dict | None = None
        if usage_total:
            token_usage_record = {
                "prompt": usage_total.get("prompt_tokens", 0),
                "completion": usage_total.get("completion_tokens", 0),
                "model": resolved_model,
                "cost_usd": usage_total.get("cost_usd", 0.0),
                "purpose": "chat",
            }

        # Save whatever we collected (partial or full). A turn that ran tools
        # but produced no prose still persists its invocations.
        if collected or invocations:
            full_content = "".join(collected)
            assistant_msg = ChatMessage(
                project_id=project_id,
                role="assistant",
                session_id=session_id,
                content=full_content,
                tool_calls={"invocations": invocations} if invocations else None,
                state_version=current_state.version if current_state else None,
                model=payload.model,
                token_usage=token_usage_record,
            )
            try:
                db.add(assistant_msg)
                # Update session metadata for the assistant message too.
                _session = await db.get(ChatSession, session_id)
                if _session:
                    _session.last_message_at = datetime.now(timezone.utc)
                    _session.message_count = (_session.message_count or 0) + 1
                await db.commit()
                try:
                    from app.services import metrics

                    metrics.record_chat_message(payload.model)
                except Exception:  # noqa: BLE001
                    pass
            except Exception as save_exc:
                log.error("chat_save_failed", project_id=str(project_id), error=str(save_exc))

        if not disconnected and not error_occurred:
            yield f"data: {json.dumps({'type': 'message_end'})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# History endpoints
# ---------------------------------------------------------------------------

@router.get("/history", response_model=list[ChatMessageResponse])
async def get_chat_history(
    project_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    before: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    query = select(ChatMessage).where(ChatMessage.project_id == project_id)
    if before:
        result_before = await db.execute(select(ChatMessage).where(ChatMessage.id == before))
        ref_msg = result_before.scalar_one_or_none()
        if ref_msg:
            query = query.where(
                (ChatMessage.created_at < ref_msg.created_at)
                | (
                    (ChatMessage.created_at == ref_msg.created_at)
                    & (ChatMessage.id < ref_msg.id)
                )
            )
    query = query.order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_history(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    from sqlalchemy import delete as sa_delete
    await db.execute(sa_delete(ChatMessage).where(ChatMessage.project_id == project_id))
    await db.commit()


# ---------------------------------------------------------------------------
# Chat session endpoints
# ---------------------------------------------------------------------------

@router.post("/sessions", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_chat_session(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    session = ChatSession(project_id=project_id)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("/sessions", response_model=list[ChatSessionResponse])
async def list_chat_sessions(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.project_id == project_id, ChatSession.archived_at.is_(None))
        .order_by(ChatSession.last_message_at.desc())
    )
    return result.scalars().all()


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageResponse])
async def get_session_messages(
    project_id: uuid.UUID,
    session_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.project_id == project_id, ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/sessions/{session_id}/export.md")
async def export_session_md(
    project_id: uuid.UUID,
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    """Section U: export a single chat session as markdown."""
    from fastapi.responses import PlainTextResponse

    from app.models.state import ChatSession
    from app.services import export_service

    session = (
        await db.execute(
            select(ChatSession).where(
                ChatSession.id == session_id, ChatSession.project_id == project_id
            )
        )
    ).scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    msgs = (
        await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.asc())
        )
    ).scalars().all()
    md = export_service.session_markdown(session, list(msgs))
    fname = f"chat-{export_service.slugify(session.title or 'chat')}.md"
    return PlainTextResponse(
        md,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.patch("/sessions/{session_id}", response_model=ChatSessionResponse)
async def update_chat_session(
    project_id: uuid.UUID,
    session_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    session = await db.get(ChatSession, session_id)
    if not session or session.project_id != project_id:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if "title" in body:
        session.title = body["title"]
    if "archived_at" in body:
        session.archived_at = body["archived_at"]
    await db.commit()
    await db.refresh(session)
    return session


# ---------------------------------------------------------------------------
# Background helpers
# ---------------------------------------------------------------------------


async def _generate_session_title(session_id: uuid.UUID, content: str) -> None:
    """Generate a short title for a new chat session via LLM and save it."""
    try:
        messages = [
            {
                "role": "user",
                "content": (
                    f"Erstelle einen kurzen Titel (max. 8 Wörter) für einen Chat der mit folgender "
                    f"Frage beginnt: '{content[:200]}'. Antworte nur mit dem Titel, ohne Anführungszeichen."
                ),
            }
        ]
        response, _usage = await llm_service.complete(messages, purpose="general", model_override=None)
        title = response.choices[0].message.content or ""
        title = title.strip().strip('"').strip("'")
        if not title:
            title = content[:40]
    except Exception:
        log.warning("session_title_generation_failed", session_id=str(session_id))
        title = content[:40]

    try:
        async with async_session_factory() as db:
            session = await db.get(ChatSession, session_id)
            if session and not session.title:
                session.title = title
                await db.commit()
    except Exception:
        log.warning("session_title_save_failed", session_id=str(session_id))


# ---------------------------------------------------------------------------
# Mutation undo endpoint
# ---------------------------------------------------------------------------

@router.post("/mutations/{undo_token}/revert", status_code=200)
async def revert_mutation(
    project_id: uuid.UUID,
    undo_token: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(get_project_member),
):
    redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        raw = await redis_client.get(f"undo:{undo_token}")
        if not raw:
            raise HTTPException(status_code=404, detail="Undo-Token abgelaufen oder nicht gefunden")

        data = json.loads(raw)
        if data["project_id"] != str(project_id):
            raise HTTPException(status_code=403, detail="Forbidden")

        # Single-use: delete before applying inverse so concurrent requests fail cleanly.
        await redis_client.delete(f"undo:{undo_token}")

        if data["tool"] == "update_task_status":
            result = await _update_task_status(
                {"task_id": data["target_id"], "status": data["original_status"]},
                project_id,
                db,
                redis_client=None,  # No new undo token for undo operations.
            )
            if result.get("success"):
                return {
                    "success": True,
                    "message": f"Rückgängig: Task '{data.get('task_title')}' → {data['original_status']}",
                }
            return {"success": False, "message": "Undo fehlgeschlagen"}

        raise HTTPException(status_code=400, detail=f"Undo nicht unterstützt für {data['tool']}")
    finally:
        try:
            await redis_client.aclose()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _gather(*coros):
    """Run multiple coroutines sequentially (avoids asyncio.gather DB session issues)."""
    results = []
    for coro in coros:
        results.append(await coro)
    return results
