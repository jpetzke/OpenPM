from __future__ import annotations

import json
from datetime import datetime, timezone
import uuid
from typing import Any

import structlog
from arq import ArqRedis
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory
from app.models.document import Document
from app.models.project import Project
from app.models.state import ProjectState, StateChangelog
from app.services import briefing as briefing_service
from app.routers.app_settings import _KEY_EMBEDDINGS
from app.services import git_service, qdrant_service
from app.services.extraction import extract_state_delta, parse_document, summarize_document
from app.services.state_manager import compute_delta, merge_state

log = structlog.get_logger()


async def _publish(redis: Any, channel: str, event: dict) -> None:
    try:
        await redis.publish(channel, json.dumps(event, default=str))
    except Exception:
        pass


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _log_pipeline(
    db: AsyncSession,
    redis: Any,
    channel: str,
    doc: Document,
    *,
    step: int,
    total: int,
    label: str,
    status: str,
    detail: str | None = None,
    meta: dict | None = None,
) -> None:
    entry = {
        "timestamp": _timestamp(),
        "step": step,
        "total": total,
        "label": label,
        "status": status,
        "detail": detail,
        "meta": meta or {},
    }
    logs = list(doc.pipeline_logs or [])
    logs.append(entry)
    doc.pipeline_logs = logs
    doc.pipeline_step = step
    doc.pipeline_step_label = label
    doc.pipeline_updated_at = datetime.now(timezone.utc)
    await db.flush()
    await _publish(
        redis,
        channel,
        {
            "event": "pipeline_progress",
            "document_id": str(doc.id),
            "step": step,
            "total": total,
            "label": label,
            "status": status,
            "detail": detail,
            "meta": meta or {},
            "timestamp": entry["timestamp"],
        },
    )


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
        doc.pipeline_logs = list(doc.pipeline_logs or [])
        doc.pipeline_updated_at = datetime.now(timezone.utc)
        await db.commit()
        await _log_pipeline(db, redis, channel, doc, step=1, total=10, label="queued", status="running", detail="Dokumentverarbeitung gestartet")

        # Step 3: parse document
        from app.services.storage import get_document_bytes
        file_bytes = get_document_bytes(doc.original_path)
        await _log_pipeline(db, redis, channel, doc, step=2, total=10, label="parsing", status="running", detail="Kreuzberg extrahiert Inhalt", meta={"mime_type": doc.mime_type, "size_bytes": doc.file_size})
        raw_content, metadata, chunks = await parse_document(file_bytes, doc.mime_type)
        await _log_pipeline(
            db,
            redis,
            channel,
            doc,
            step=2,
            total=10,
            label="parsing",
            status="done",
            detail="Extraktion abgeschlossen",
            meta={"chunk_count": len(chunks), "raw_length": len(raw_content), "metadata_keys": sorted((metadata or {}).keys())},
        )

        # Step 4: store content
        doc.raw_content = raw_content
        doc.doc_metadata = metadata
        doc.summary = await summarize_document(raw_content)
        await db.commit()
        await _log_pipeline(db, redis, channel, doc, step=3, total=10, label="document_insights", status="done", detail="Rohtext und Summary gespeichert", meta={"summary_length": len(doc.summary or "")})

        # Step 5: load current state with advisory lock to prevent concurrent version conflicts
        # The advisory lock is keyed on the project_id's lower 64 bits, serialising concurrent
        # document processing for the same project across connections.
        lock_key = doc.project_id.int & 0x7FFFFFFFFFFFFFFF
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})

        state_result = await db.execute(
            select(ProjectState)
            .where(ProjectState.project_id == doc.project_id)
            .order_by(ProjectState.version.desc())
            .limit(1)
        )
        current_state_obj = state_result.scalar_one_or_none()
        current_state = current_state_obj.state if current_state_obj else {}
        current_version = current_state_obj.version if current_state_obj else 0

        # Idempotency guard: if this document already produced a state version, reuse it.
        # This handles task retries where the pipeline succeeded past step 8 but later failed.
        existing_for_doc_result = await db.execute(
            select(ProjectState)
            .where(
                ProjectState.project_id == doc.project_id,
                ProjectState.triggered_by_document_id == doc.id,
            )
            .limit(1)
        )
        existing_for_doc = existing_for_doc_result.scalar_one_or_none()
        await _log_pipeline(db, redis, channel, doc, step=4, total=10, label="state_load", status="done", detail="Aktuellen Projekt-State geladen", meta={"current_version": current_version})

        # Step 6: LLM extraction
        await _log_pipeline(db, redis, channel, doc, step=5, total=10, label="state_extraction", status="running", detail="LLM extrahiert State-Delta")
        delta = await extract_state_delta(raw_content, current_state or None)
        await _log_pipeline(
            db,
            redis,
            channel,
            doc,
            step=5,
            total=10,
            label="state_extraction",
            status="done",
            detail="State-Delta erzeugt",
            meta={"dynamic_sections": len(delta.get("dynamic_sections") or []), "custom_keys": sorted((delta.get("custom") or {}).keys())},
        )

        # Step 7: merge state
        new_state = merge_state(current_state, delta)
        await _log_pipeline(
            db,
            redis,
            channel,
            doc,
            step=6,
            total=10,
            label="state_merge",
            status="done",
            detail="Delta in Projekt-State integriert",
            meta={"core_counts": {key: len(new_state.get("core", {}).get(key, [])) for key in ["contacts", "open_tasks", "deadlines", "decisions", "blockers"]}, "dynamic_sections": len(new_state.get("dynamic_sections") or [])},
        )

        # Step 8: write new state — idempotent upsert guards against retry duplicates.
        # The advisory lock above ensures only one pipeline per project computes a version
        # at a time, so new_version is safe. ON CONFLICT DO UPDATE makes retries harmless.
        if existing_for_doc is not None:
            # Retry path: update the existing state row in-place instead of inserting a duplicate.
            existing_for_doc.state = new_state
            new_state_obj = existing_for_doc
            new_version = existing_for_doc.version
        else:
            new_version = current_version + 1
            stmt = (
                pg_insert(ProjectState)
                .values(
                    id=uuid.uuid4(),
                    project_id=doc.project_id,
                    version=new_version,
                    state=new_state,
                    triggered_by_document_id=doc.id,
                )
                .on_conflict_do_update(
                    constraint="project_state_version_unique",
                    set_={"state": new_state, "triggered_by_document_id": doc.id},
                )
                .returning(ProjectState)
            )
            result = await db.execute(stmt)
            new_state_obj = result.scalar_one()
            new_version = new_state_obj.version
        await db.flush()
        await _log_pipeline(db, redis, channel, doc, step=7, total=10, label="state_persist", status="done", detail="Neue State-Version gespeichert", meta={"new_version": new_version})

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
        await _log_pipeline(db, redis, channel, doc, step=8, total=10, label="changelog", status="done", detail="Changelog erzeugt")

        # Step 10: git commit
        commit_summary_parts = []
        added = computed_delta.get("added", {})
        for key, items in added.items():
            name = key.split(".")[-1]
            commit_summary_parts.append(f"{len(items)} {name} added")
        commit_msg = f"upload({doc.original_filename}): {', '.join(commit_summary_parts) or 'state updated'}"
        commit_hash = git_service.commit_state(str(doc.project_id), new_state, commit_msg)
        await _log_pipeline(db, redis, channel, doc, step=9, total=10, label="git_commit", status="done", detail="State in Git gesichert", meta={"commit_hash": commit_hash})

        # Step 11: store commit hash
        doc.git_commit_hash = commit_hash
        changelog.git_commit_hash = commit_hash
        await db.commit()
        await _log_pipeline(db, redis, channel, doc, step=9, total=10, label="git_commit", status="done", detail="Commit-Hash im Dokument gespeichert", meta={"commit_hash": commit_hash})

        # Step 12: embed chunks (skipped when embeddings disabled in settings)
        embeddings_flag = await redis.get(_KEY_EMBEDDINGS)
        if chunks and embeddings_flag != "0":
            await qdrant_service.upsert_chunks(str(doc.project_id), chunks, str(doc.id), doc.original_filename)
        await _log_pipeline(db, redis, channel, doc, step=10, total=10, label="embeddings", status="done", detail="Embeddings verarbeitet", meta={"enabled": embeddings_flag != "0", "chunk_count": len(chunks)})

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
        await _log_pipeline(db, redis, channel, doc, step=10, total=10, label="briefing", status="done", detail="Projekt-Briefing aktualisiert")

        # Step 14: done
        doc.processing_status = "done"
        doc.pipeline_step = 10
        doc.pipeline_step_label = "complete"
        doc.pipeline_updated_at = datetime.now(timezone.utc)
        await db.commit()
        await _publish(redis, channel, {"event": "pipeline_complete", "document_id": document_id, "state_version": new_version, "step": 10, "total": 10, "label": "complete", "status": "done", "timestamp": _timestamp()})

    except Exception as exc:
        log.error("pipeline_failed", document_id=document_id, error=str(exc))
        try:
            doc.processing_status = "failed"
            doc.processing_error = str(exc)
            logs = list(doc.pipeline_logs or [])
            logs.append({
                "timestamp": _timestamp(),
                "step": doc.pipeline_step,
                "total": 10,
                "label": doc.pipeline_step_label or "failed",
                "status": "failed",
                "detail": str(exc),
                "meta": {},
            })
            doc.pipeline_logs = logs
            doc.pipeline_updated_at = datetime.now(timezone.utc)
            await db.commit()
        except Exception:
            pass
        if channel:
            await _publish(redis, channel, {"event": "pipeline_failed", "document_id": document_id, "error": str(exc), "step": doc.pipeline_step, "total": 10, "label": doc.pipeline_step_label, "status": "failed", "timestamp": _timestamp()})
        raise
