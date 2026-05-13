from __future__ import annotations

import json
import uuid
from typing import Any

import structlog
from arq import ArqRedis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory
from app.models.document import Document
from app.models.project import Project
from app.models.state import ProjectState, StateChangelog
from app.services import briefing as briefing_service
from app.services import git_service, qdrant_service
from app.services.extraction import extract_state_delta, parse_document
from app.services.state_manager import compute_delta, merge_state

log = structlog.get_logger()


async def _publish(redis: Any, channel: str, event: dict) -> None:
    try:
        await redis.publish(channel, json.dumps(event, default=str))
    except Exception:
        pass


async def process_document(ctx: dict, document_id: str) -> None:
    redis = ctx["redis"]
    async with async_session_factory() as db:
        await _process(db, redis, document_id)


async def _process(db: AsyncSession, redis: Any, document_id: str) -> None:
    channel = None
    doc_uuid = uuid.UUID(document_id)

    # Load document
    result = await db.execute(select(Document).where(Document.id == doc_uuid))
    doc = result.scalar_one_or_none()
    if not doc:
        log.error("document_not_found", document_id=document_id)
        return

    channel = f"pipeline:{doc.project_id}"
    await _publish(redis, channel, {"event": "pipeline_started", "document_id": document_id})

    try:
        # Step 2: mark processing
        doc.processing_status = "processing"
        await db.commit()
        await _publish(redis, channel, {"event": "pipeline_step", "document_id": document_id, "step": 2, "total": 14})

        # Step 3: parse document
        from app.services.storage import get_document_bytes
        file_bytes = get_document_bytes(doc.original_path)
        raw_content, metadata, chunks = await parse_document(file_bytes, doc.mime_type)
        await _publish(redis, channel, {"event": "pipeline_step", "document_id": document_id, "step": 3, "total": 14})

        # Step 4: store content
        doc.raw_content = raw_content
        doc.doc_metadata = metadata
        await db.commit()
        await _publish(redis, channel, {"event": "pipeline_step", "document_id": document_id, "step": 4, "total": 14})

        # Step 5: load current state with lock
        state_result = await db.execute(
            select(ProjectState)
            .where(ProjectState.project_id == doc.project_id)
            .order_by(ProjectState.version.desc())
            .limit(1)
            .with_for_update()
        )
        current_state_obj = state_result.scalar_one_or_none()
        current_state = current_state_obj.state if current_state_obj else {}
        current_version = current_state_obj.version if current_state_obj else 0
        await _publish(redis, channel, {"event": "pipeline_step", "document_id": document_id, "step": 5, "total": 14})

        # Step 6: LLM extraction
        delta = await extract_state_delta(raw_content, current_state or None)
        await _publish(redis, channel, {"event": "pipeline_step", "document_id": document_id, "step": 6, "total": 14})

        # Step 7: merge state
        new_state = merge_state(current_state, delta)
        await _publish(redis, channel, {"event": "pipeline_step", "document_id": document_id, "step": 7, "total": 14})

        # Step 8: write new state
        new_version = current_version + 1
        new_state_obj = ProjectState(
            project_id=doc.project_id,
            version=new_version,
            state=new_state,
            triggered_by_document_id=doc.id,
        )
        db.add(new_state_obj)
        await db.flush()
        await _publish(redis, channel, {"event": "pipeline_step", "document_id": document_id, "step": 8, "total": 14})

        # Step 9: changelog
        computed_delta = compute_delta(current_state, new_state)
        changelog = StateChangelog(
            project_id=doc.project_id,
            from_version=current_version if current_version > 0 else None,
            to_version=new_version,
            delta=computed_delta,
            document_id=doc.id,
            triggered_by="pipeline",
        )
        db.add(changelog)
        await db.flush()
        await _publish(redis, channel, {"event": "pipeline_step", "document_id": document_id, "step": 9, "total": 14})

        # Step 10: git commit
        commit_summary_parts = []
        added = computed_delta.get("added", {})
        for key, items in added.items():
            name = key.split(".")[-1]
            commit_summary_parts.append(f"{len(items)} {name} added")
        commit_msg = f"upload({doc.original_filename}): {', '.join(commit_summary_parts) or 'state updated'}"
        commit_hash = git_service.commit_state(str(doc.project_id), new_state, commit_msg)
        await _publish(redis, channel, {"event": "pipeline_step", "document_id": document_id, "step": 10, "total": 14})

        # Step 11: store commit hash
        doc.git_commit_hash = commit_hash
        changelog.git_commit_hash = commit_hash
        await db.commit()
        await _publish(redis, channel, {"event": "pipeline_step", "document_id": document_id, "step": 11, "total": 14})

        # Step 12: embed chunks
        if chunks:
            await qdrant_service.upsert_chunks(str(doc.project_id), chunks, str(doc.id), doc.original_filename)
        await _publish(redis, channel, {"event": "pipeline_step", "document_id": document_id, "step": 12, "total": 14})

        # Step 13: render briefing
        proj_result = await db.execute(select(Project).where(Project.id == doc.project_id))
        project = proj_result.scalar_one_or_none()

        recent_changelog_result = await db.execute(
            select(StateChangelog)
            .where(StateChangelog.project_id == doc.project_id)
            .order_by(StateChangelog.created_at.desc())
            .limit(3)
        )
        recent_cl = recent_changelog_result.scalars().all()
        cl_dicts = [{"to_version": c.to_version, "triggered_by": c.triggered_by} for c in recent_cl]

        if project:
            briefing_text = briefing_service.render_briefing(
                {"name": project.name, "client_name": project.client_name, "status": project.status, "updated_at": str(project.updated_at)},
                new_state,
                new_version,
                cl_dicts,
            )
            project.compiled_briefing = briefing_text
            await db.commit()
        await _publish(redis, channel, {"event": "pipeline_step", "document_id": document_id, "step": 13, "total": 14})

        # Step 14: done
        doc.processing_status = "done"
        await db.commit()
        await _publish(redis, channel, {"event": "pipeline_complete", "document_id": document_id, "state_version": new_version})

    except Exception as exc:
        log.error("pipeline_failed", document_id=document_id, error=str(exc))
        try:
            doc.processing_status = "failed"
            doc.processing_error = str(exc)
            await db.commit()
        except Exception:
            pass
        if channel:
            await _publish(redis, channel, {"event": "pipeline_failed", "document_id": document_id, "error": str(exc)})
        raise
