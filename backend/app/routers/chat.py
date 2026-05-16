from __future__ import annotations

import copy
import json
import uuid
from collections.abc import AsyncGenerator
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_config import MAX_AGENT_ROUNDS
from app.auth import get_current_user, get_project_member
from app.config import settings as app_settings_config
from app.database import get_db
from app.models.document import Document
from app.models.project import Project, ProjectMember
from app.models.state import ChatMessage, ProjectState, StateChangelog
from app.models.user import User
from app.routers.app_settings import _KEY_EMBEDDINGS
from app.schemas.chat import ChatMessageCreate, ChatMessageResponse
from app.services import briefing as briefing_service
from app.services import git_service
from app.services import llm as llm_service
from app.services import qdrant_service
from redis.asyncio import Redis as ARedis

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
        "parameters": {"type": "object", "properties": {}},
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
        "parameters": {"type": "object", "properties": {}},
    },
}

_TOOL_GET_STATE_HISTORY = {
    "type": "function",
    "function": {
        "name": "get_state_history",
        "description": "Get recent state-change entries from the changelog. Shows what changed, when, and how.",
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "default": 10,
                    "description": "Number of recent changes to retrieve (default 10, max 50)",
                }
            },
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
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural-language search query"},
                "limit": {"type": "integer", "default": 5, "description": "Number of results (max 10)"},
            },
            "required": ["query"],
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
        "parameters": {
            "type": "object",
            "properties": {"document_id": {"type": "string", "description": "UUID of the document"}},
            "required": ["document_id"],
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
        },
    },
}

_ALL_TOOLS = [
    _TOOL_LIST_DOCUMENTS,
    _TOOL_GET_CURRENT_STATE,
    _TOOL_GET_STATE_HISTORY,
    _TOOL_SEARCH_DOCUMENTS,
    _TOOL_GET_DOCUMENT_CONTENT,
    _TOOL_UPDATE_TASK_STATUS,
]

_TOOLS_WITHOUT_SEARCH = [t for t in _ALL_TOOLS if t["function"]["name"] != "search_documents"]


# ---------------------------------------------------------------------------
# System prompt builder
# ---------------------------------------------------------------------------

def _build_system_prompt(project: Project, current_state: ProjectState | None, documents: list[Document]) -> str:
    state_json = json.dumps(current_state.state, ensure_ascii=False, indent=2) if current_state else "null"
    state_version = current_state.version if current_state else "–"

    if documents:
        docs_lines = []
        for d in documents:
            summary_snippet = ""
            if d.summary:
                summary_snippet = f" | {d.summary[:150]}{'…' if len(d.summary) > 150 else ''}"
            docs_lines.append(
                f"- {d.id} | {d.original_filename} | {d.processing_status}{summary_snippet}"
            )
        docs_section = "\n".join(docs_lines)
    else:
        docs_section = "Noch keine Dokumente hochgeladen."

    briefing = project.compiled_briefing or "Noch kein Briefing generiert."

    return f"""<identity>
Du bist ein intelligenter Projektassistent in OpenPM. Du hast vollständigen Zugriff auf alle Projektdaten und hilfst dem Team dabei, den Projektstatus zu verstehen, Dokumente zu analysieren, Aufgaben zu verwalten und Fragen präzise zu beantworten.
</identity>

<project>
Name: {project.name}
Kunde: {project.client_name or "–"}
Status: {project.status}
State-Version: {state_version}
</project>

<current_state>
{state_json}
</current_state>

<documents>
Format: <id> | <dateiname> | <status> | <zusammenfassung>
{docs_section}
</documents>

<briefing>
{briefing}
</briefing>

<tools_guidance>
Nutze Tools proaktiv und intelligent:
- Projektstatus, Aufgaben, Kontakte, Deadlines, Blocker → bereits in <current_state> verfügbar, KEIN Tool nötig
- Fragen zu Dokumentinhalten, Suche nach konkreten Textstellen → search_documents, dann bei Bedarf get_document_content
- "Welche Dokumente gibt es?" → list_documents
- Letzte Änderungen, was hat sich wann geändert? → get_state_history
- Aufgabe als erledigt / blockiert / offen markieren → update_task_status
- Du kannst mehrere Tools sequenziell aufrufen (max. {MAX_AGENT_ROUNDS} Runden)
- Rufe nie unnötige Tools auf, wenn die Antwort bereits aus dem Kontext hervorgeht
</tools_guidance>

<response_style>
- Antworte in der gleichen Sprache wie der User (Deutsch oder Englisch)
- Präzise und hilfreich — keine Füllphrasen, kein Aufwärmen
- Nutze Markdown für Struktur (Listen, **Fett** für Namen/Daten), wenn es der Übersicht dient
- Referenziere konkrete Dokumente (Dateiname), Task-IDs oder Daten wenn möglich
- Bei Unklarheiten: eine gezielte Rückfrage stellen
</response_style>"""


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------

async def _execute_tool(tool_name: str, tool_args: dict, project_id: uuid.UUID, db: AsyncSession) -> Any:
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
        limit = min(int(tool_args.get("limit", 10)), 50)
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
        results = await qdrant_service.search(
            str(project_id), tool_args["query"], min(int(tool_args.get("limit", 5)), 10)
        )
        return [{"chunk_text": r.chunk_text, "source_filename": r.source_filename, "score": r.score} for r in results]

    if tool_name == "get_document_content":
        result = await db.execute(
            select(Document).where(Document.id == uuid.UUID(tool_args["document_id"]))
        )
        doc = result.scalar_one_or_none()
        if not doc:
            return {"error": "Document not found"}
        return {"content": doc.raw_content or "", "filename": doc.original_filename}

    if tool_name == "update_task_status":
        return await _update_task_status(tool_args, project_id, db)

    return {"error": f"Unknown tool: {tool_name}"}


async def _update_task_status(tool_args: dict, project_id: uuid.UUID, db: AsyncSession) -> dict:
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
        briefing_text = briefing_service.render_briefing(
            {
                "name": project.name,
                "client_name": project.client_name,
                "status": project.status,
                "updated_at": project.updated_at.isoformat(),
            },
            new_state_data,
            new_version,
            [{"to_version": new_version, "triggered_by": "chat_tool"}],
        )
        project.compiled_briefing = briefing_text

    await db.commit()

    commit_msg = f"chat_tool: task {task_id} set to {new_status}"
    commit_hash = git_service.commit_state(str(project_id), new_state_data, commit_msg)
    changelog.git_commit_hash = commit_hash
    await db.commit()

    return {
        "success": True,
        "task_id": task_id,
        "title": task.get("title"),
        "old_status": old_status,
        "new_status": new_status,
    }


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
) -> AsyncGenerator[dict, None]:
    """
    Multi-round agentic loop. Yields:
      {"type": "content_delta", "delta": str}
      {"type": "tool_call", "tools": [str]}
    """
    msgs = list(messages)  # local copy

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

        if not has_tool_calls:
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
            result = await _execute_tool(tc["name"], args, project_id, db)
            msgs.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": json.dumps(result, default=str),
            })

        log.info("chat_agent_round_done", round=round_idx, tools=[tc["name"] for tc in pending_tool_calls])


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

    # Persist the user message right away.
    user_msg = ChatMessage(
        project_id=project_id,
        user_id=current_user.id,
        role="user",
        content=payload.content,
        state_version=current_state.version if current_state else None,
        model=payload.model,
    )
    db.add(user_msg)
    await db.commit()

    # Determine active tools (disable search if embeddings are off).
    _redis = ARedis.from_url(app_settings_config.redis_url, decode_responses=True)
    embeddings_flag = await _redis.get(_KEY_EMBEDDINGS)
    active_tools = _TOOLS_WITHOUT_SEARCH if embeddings_flag == "0" else _ALL_TOOLS

    # Build message list for the LLM.
    system_prompt = _build_system_prompt(project, current_state, documents)
    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    for msg in history:
        if msg.role in ("user", "assistant") and msg.content:
            messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": payload.content})

    # Streaming generator.
    async def generate():
        collected: list[str] = []
        tool_calls_log: list[str] = []
        error_occurred = False
        disconnected = False

        try:
            yield f"data: {json.dumps({'type': 'message_start'})}\n\n"

            async for event in _run_agent(messages, active_tools, project_id, db, payload.model, request):
                if await request.is_disconnected():
                    disconnected = True
                    break

                if event["type"] == "content_delta":
                    collected.append(event["delta"])
                    yield f"data: {json.dumps({'type': 'content_delta', 'delta': event['delta']})}\n\n"
                elif event["type"] == "tool_call":
                    tool_calls_log.extend(event["tools"])
                    yield f"data: {json.dumps({'type': 'tool_call', 'tools': event['tools']})}\n\n"

            if await request.is_disconnected():
                disconnected = True

        except Exception as exc:
            error_occurred = True
            log.error("chat_stream_failed", project_id=str(project_id), error=str(exc))
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

        # Save whatever we collected (partial or full).
        if collected:
            full_content = "".join(collected)
            assistant_msg = ChatMessage(
                project_id=project_id,
                role="assistant",
                content=full_content,
                tool_calls={"calls": tool_calls_log} if tool_calls_log else None,
                state_version=current_state.version if current_state else None,
                model=payload.model,
            )
            try:
                db.add(assistant_msg)
                await db.commit()
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
            query = query.where(ChatMessage.created_at < ref_msg.created_at)
    query = query.order_by(ChatMessage.created_at.asc()).limit(limit)
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
# Helpers
# ---------------------------------------------------------------------------

async def _gather(*coros):
    """Run multiple coroutines sequentially (avoids asyncio.gather DB session issues)."""
    results = []
    for coro in coros:
        results.append(await coro)
    return results
