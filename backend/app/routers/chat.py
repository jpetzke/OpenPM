import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_project_member
from app.database import get_db
from app.models.project import ProjectMember
from app.models.state import ChatMessage, ProjectState, StateChangelog
from app.models.user import User
from app.schemas.chat import ChatMessageCreate, ChatMessageResponse
from app.services import llm as llm_service
from app.services import qdrant_service

router = APIRouter(prefix="/api/projects/{project_id}/chat", tags=["chat"])

_CHAT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_state_history",
            "description": "Get recent state changes from changelog",
            "parameters": {
                "type": "object",
                "properties": {"limit": {"type": "integer", "default": 10}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_documents",
            "description": "Semantic search over project documents",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "limit": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_document_content",
            "description": "Get full raw content of a document",
            "parameters": {
                "type": "object",
                "properties": {"document_id": {"type": "string"}},
                "required": ["document_id"],
            },
        },
    },
]


async def _execute_tool(tool_name: str, tool_args: dict, project_id: uuid.UUID, db: AsyncSession) -> Any:
    if tool_name == "get_state_history":
        limit = tool_args.get("limit", 10)
        result = await db.execute(
            select(StateChangelog)
            .where(StateChangelog.project_id == project_id)
            .order_by(StateChangelog.created_at.desc())
            .limit(limit)
        )
        entries = result.scalars().all()
        return [{"to_version": e.to_version, "triggered_by": e.triggered_by, "delta": e.delta} for e in entries]

    if tool_name == "search_documents":
        results = await qdrant_service.search(str(project_id), tool_args["query"], tool_args.get("limit", 5))
        return [{"chunk_text": r.chunk_text, "source_filename": r.source_filename, "score": r.score} for r in results]

    if tool_name == "get_document_content":
        from app.models.document import Document
        result = await db.execute(
            select(Document).where(Document.id == uuid.UUID(tool_args["document_id"]))
        )
        doc = result.scalar_one_or_none()
        if not doc:
            return {"error": "Document not found"}
        return {"content": doc.raw_content or "", "filename": doc.original_filename}

    return {"error": f"Unknown tool: {tool_name}"}


@router.post("", response_class=StreamingResponse)
async def chat(
    project_id: uuid.UUID,
    payload: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(get_project_member),
):
    state_result = await db.execute(
        select(ProjectState)
        .where(ProjectState.project_id == project_id)
        .order_by(ProjectState.version.desc())
        .limit(1)
    )
    current_state = state_result.scalar_one_or_none()

    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.project_id == project_id)
        .order_by(ChatMessage.created_at.asc())
        .limit(50)
    )
    history = history_result.scalars().all()

    user_msg = ChatMessage(
        project_id=project_id,
        user_id=current_user.id,
        role="user",
        content=payload.content,
        state_version=current_state.version if current_state else None,
    )
    db.add(user_msg)
    await db.commit()

    messages = []
    if current_state:
        from app.models.project import Project
        proj_result = await db.execute(select(Project).where(Project.id == project_id))
        proj = proj_result.scalar_one_or_none()
        if proj and proj.compiled_briefing:
            messages.append({"role": "system", "content": f"Project briefing:\n{proj.compiled_briefing}"})

    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": payload.content})

    async def generate():
        collected = []
        tool_calls_data = None

        try:
            response = await llm_service.complete(messages, tools=_CHAT_TOOLS)
            choice = response.choices[0]

            if choice.finish_reason == "tool_calls" and choice.message.tool_calls:
                tool_calls = choice.message.tool_calls
                tool_calls_data = [{"id": tc.id, "name": tc.function.name, "arguments": tc.function.arguments} for tc in tool_calls]
                yield f"data: {json.dumps({'type': 'tool_call', 'tools': [tc['name'] for tc in tool_calls_data]})}\n\n"

                tool_messages = list(messages)
                tool_messages.append({"role": "assistant", "content": None, "tool_calls": [
                    {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in tool_calls
                ]})

                for tc in tool_calls:
                    args = json.loads(tc.function.arguments)
                    tool_result = await _execute_tool(tc.function.name, args, project_id, db)
                    tool_messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(tool_result, default=str),
                    })

                final_response = await llm_service.complete(tool_messages)
                content = final_response.choices[0].message.content or ""
                collected.append(content)
                yield f"data: {json.dumps({'type': 'content', 'text': content})}\n\n"
            else:
                content = choice.message.content or ""
                collected.append(content)
                yield f"data: {json.dumps({'type': 'content', 'text': content})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            return

        full_content = "".join(collected)
        assistant_msg = ChatMessage(
            project_id=project_id,
            role="assistant",
            content=full_content,
            tool_calls={"calls": tool_calls_data} if tool_calls_data else None,
            state_version=current_state.version if current_state else None,
        )
        db.add(assistant_msg)
        await db.commit()
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


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
    from sqlalchemy import delete
    await db.execute(delete(ChatMessage).where(ChatMessage.project_id == project_id))
    await db.commit()
