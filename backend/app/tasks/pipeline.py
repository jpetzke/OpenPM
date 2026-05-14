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


async def process_project_batch(ctx: dict, project_id: str) -> None:
    """Process all documents queued in the pending batch for a project as one state update.

    Each upload enqueues its own deferred job and refreshes the trigger timestamp.
    Jobs that arrive while more uploads are expected exit early — only the job that
    runs after the 10-second idle window actually processes the batch.
    """
    import time as _time
    redis = ctx["redis"]
    channel = f"pipeline:{project_id}"
    project_uuid = uuid.UUID(project_id)

    # Exit early if another upload extended the window after this job was scheduled
    raw_trigger = await redis.get(f"batch_trigger:{project_id}")
    if raw_trigger:
        trigger_at = float(raw_trigger.decode() if isinstance(raw_trigger, bytes) else raw_trigger)
        if _time.time() < trigger_at:
            return

    batch_key = f"pending_batch:{project_id}"
    # Atomically hand off the pending set to a private key so uploads during
    # processing land in a fresh set and get their own subsequent batch job.
    temp_key = f"processing_batch:{project_id}:{uuid.uuid4().hex}"
    try:
        await redis.rename(batch_key, temp_key)
    except Exception:
        return  # Key didn't exist — nothing to process
    raw_ids = await redis.smembers(temp_key)
    await redis.delete(temp_key)
    if not raw_ids:
        return

    doc_uuids = [uuid.UUID(d.decode() if isinstance(d, bytes) else d) for d in raw_ids]

    async with async_session_factory() as db:
        result = await db.execute(
            select(Document).where(
                Document.id.in_(doc_uuids),
                Document.processing_status == "pending",
            )
        )
        docs = list(result.scalars().all())
        if not docs:
            return

        # Mark all as processing
        for doc in docs:
            doc.processing_status = "processing"
            doc.pipeline_logs = []
            doc.pipeline_updated_at = datetime.now(timezone.utc)
            await _publish(redis, channel, {"event": "pipeline_started", "document_id": str(doc.id)})
        await db.commit()

        from app.services.storage import get_document_bytes

        parse_results: list[tuple[Document, str, dict, list[str]]] = []
        failed_docs: list[Document] = []

        # Phase 1: parse all documents (each with its own log events)
        for doc in docs:
            try:
                await _log_pipeline(db, redis, channel, doc, step=1, total=10, label="queued", status="done", detail="Dokumentverarbeitung gestartet")
                await _log_pipeline(db, redis, channel, doc, step=2, total=10, label="parsing", status="running", detail="Kreuzberg extrahiert Inhalt", meta={"mime_type": doc.mime_type, "size_bytes": doc.file_size})
                file_bytes = get_document_bytes(doc.original_path)
                raw_content, metadata, chunks = await parse_document(file_bytes, doc.mime_type)
                doc.raw_content = raw_content
                doc.doc_metadata = metadata
                await db.flush()
                await _log_pipeline(db, redis, channel, doc, step=2, total=10, label="parsing", status="done", detail="Extraktion abgeschlossen", meta={"chunk_count": len(chunks), "raw_length": len(raw_content)})
                parse_results.append((doc, raw_content, metadata, chunks))
            except Exception as exc:
                log.error("batch_parse_failed", document_id=str(doc.id), error=str(exc))
                doc.processing_status = "failed"
                doc.processing_error = str(exc)
                await _log_pipeline(db, redis, channel, doc, step=2, total=10, label="parsing", status="failed", detail=str(exc))
                failed_docs.append(doc)
        await db.commit()

        for doc in failed_docs:
            await _publish(redis, channel, {"event": "pipeline_failed", "document_id": str(doc.id), "error": doc.processing_error or "Parse failed", "timestamp": _timestamp()})

        if not parse_results:
            return

        # Phase 2: summarize each document (LLM step 1 per doc)
        for doc, raw_content, _metadata, _chunks in parse_results:
            await _log_pipeline(db, redis, channel, doc, step=3, total=10, label="summarizing", status="running", detail="LLM erstellt Zusammenfassung")
            doc.summary = await summarize_document(raw_content)
            await db.flush()
            await _log_pipeline(db, redis, channel, doc, step=3, total=10, label="summarizing", status="done", detail="Zusammenfassung erstellt", meta={"summary_length": len(doc.summary or "")})
        await db.commit()

        # Phase 3: state extraction — advisory lock, one version for the whole batch
        lock_key = project_uuid.int & 0x7FFFFFFFFFFFFFFF
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})

        state_result = await db.execute(
            select(ProjectState)
            .where(ProjectState.project_id == project_uuid)
            .order_by(ProjectState.version.desc())
            .limit(1)
        )
        current_state_obj = state_result.scalar_one_or_none()
        current_state = current_state_obj.state if current_state_obj else {}
        current_version = current_state_obj.version if current_state_obj else 0

        for doc, _, _, _ in parse_results:
            await _log_pipeline(db, redis, channel, doc, step=4, total=10, label="state_load", status="done", detail="Projekt-State geladen", meta={"current_version": current_version})

        # Extract and accumulate deltas sequentially (each doc sees the merged state so far)
        accumulated_state = current_state
        for doc, raw_content, _, _ in parse_results:
            await _log_pipeline(db, redis, channel, doc, step=5, total=10, label="state_extraction", status="running", detail="LLM extrahiert State-Delta")
            delta = await extract_state_delta(raw_content, accumulated_state or None)
            accumulated_state = merge_state(accumulated_state, delta)
            await _log_pipeline(db, redis, channel, doc, step=5, total=10, label="state_extraction", status="done", detail="State-Delta erzeugt", meta={"dynamic_sections": len(delta.get("dynamic_sections") or [])})

        new_state = accumulated_state

        for doc, _, _, _ in parse_results:
            await _log_pipeline(db, redis, channel, doc, step=6, total=10, label="state_merge", status="done", detail="Delta in Projekt-State integriert")

        # Write ONE state version for the whole batch
        primary_doc = parse_results[0][0]
        new_version = current_version + 1
        stmt = (
            pg_insert(ProjectState)
            .values(
                id=uuid.uuid4(),
                project_id=project_uuid,
                version=new_version,
                state=new_state,
                triggered_by_document_id=primary_doc.id,
            )
            .on_conflict_do_update(
                constraint="project_state_version_unique",
                set_={"state": new_state, "triggered_by_document_id": primary_doc.id},
            )
            .returning(ProjectState)
        )
        result = await db.execute(stmt)
        new_state_obj = result.scalar_one()
        new_version = new_state_obj.version
        await db.flush()

        for doc, _, _, _ in parse_results:
            await _log_pipeline(db, redis, channel, doc, step=7, total=10, label="state_persist", status="done", detail="Neue State-Version gespeichert", meta={"new_version": new_version})

        # Changelog
        computed_delta = compute_delta(current_state, new_state)
        changelog = StateChangelog(
            project_id=project_uuid,
            from_version=current_version if current_version > 0 else None,
            to_version=new_version,
            delta=computed_delta,
            document_id=primary_doc.id,
            triggered_by="pipeline",
        )
        db.add(changelog)
        await db.flush()

        for doc, _, _, _ in parse_results:
            await _log_pipeline(db, redis, channel, doc, step=8, total=10, label="changelog", status="done", detail="Changelog erzeugt")

        # Git commit
        doc_names = [d.original_filename for d, _, _, _ in parse_results]
        commit_summary_parts = []
        for key, items in computed_delta.get("added", {}).items():
            commit_summary_parts.append(f"{len(items)} {key.split('.')[-1]} added")
        prefix = f"upload({doc_names[0]})" if len(doc_names) == 1 else f"batch_upload({len(doc_names)} docs)"
        commit_msg = f"{prefix}: {', '.join(commit_summary_parts) or 'state updated'}"
        commit_hash = git_service.commit_state(project_id, new_state, commit_msg)

        for doc, _, _, _ in parse_results:
            doc.git_commit_hash = commit_hash
            await _log_pipeline(db, redis, channel, doc, step=9, total=10, label="git_commit", status="done", detail="State in Git gesichert", meta={"commit_hash": commit_hash})
        changelog.git_commit_hash = commit_hash
        await db.commit()

        # Embeddings
        embeddings_flag = await redis.get(_KEY_EMBEDDINGS)
        for doc, _, _, chunks in parse_results:
            if chunks and embeddings_flag != "0":
                await qdrant_service.upsert_chunks(project_id, chunks, str(doc.id), doc.original_filename)
            await _log_pipeline(db, redis, channel, doc, step=10, total=10, label="embeddings", status="done", detail="Embeddings verarbeitet", meta={"enabled": embeddings_flag != "0", "chunk_count": len(chunks)})

        # Briefing
        proj_result = await db.execute(select(Project).where(Project.id == project_uuid))
        project = proj_result.scalar_one_or_none()
        recent_cl_result = await db.execute(
            select(StateChangelog).where(StateChangelog.project_id == project_uuid).order_by(StateChangelog.created_at.desc()).limit(3)
        )
        cl_dicts = [{"to_version": c.to_version, "triggered_by": c.triggered_by} for c in recent_cl_result.scalars().all()]
        if project:
            briefing_text = briefing_service.render_briefing(
                {"name": project.name, "client_name": project.client_name, "status": project.status, "updated_at": str(project.updated_at)},
                new_state, new_version, cl_dicts,
            )
            project.compiled_briefing = briefing_text
            await db.commit()

        for doc, _, _, _ in parse_results:
            await _log_pipeline(db, redis, channel, doc, step=10, total=10, label="briefing", status="done", detail="Projekt-Briefing aktualisiert")

        # Mark all successful docs as done
        for doc, _, _, _ in parse_results:
            doc.processing_status = "done"
            doc.pipeline_step = 10
            doc.pipeline_step_label = "complete"
            doc.pipeline_updated_at = datetime.now(timezone.utc)
        await db.commit()

        for doc, _, _, _ in parse_results:
            await _publish(redis, channel, {
                "event": "pipeline_complete",
                "document_id": str(doc.id),
                "state_version": new_version,
                "step": 10, "total": 10, "label": "complete", "status": "done",
                "timestamp": _timestamp(),
            })


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
        # Mark processing
        doc.processing_status = "processing"
        doc.pipeline_logs = list(doc.pipeline_logs or [])
        doc.pipeline_updated_at = datetime.now(timezone.utc)
        await db.commit()
        await _log_pipeline(db, redis, channel, doc, step=1, total=10, label="queued", status="done", detail="Dokumentverarbeitung gestartet")

        # Parse
        from app.services.storage import get_document_bytes
        file_bytes = get_document_bytes(doc.original_path)
        await _log_pipeline(db, redis, channel, doc, step=2, total=10, label="parsing", status="running", detail="Kreuzberg extrahiert Inhalt", meta={"mime_type": doc.mime_type, "size_bytes": doc.file_size})
        raw_content, metadata, chunks = await parse_document(file_bytes, doc.mime_type)
        # Persist raw content immediately so the detail panel can show it before the LLM steps
        doc.raw_content = raw_content
        doc.doc_metadata = metadata
        await db.flush()
        await _log_pipeline(
            db, redis, channel, doc, step=2, total=10, label="parsing", status="done",
            detail="Extraktion abgeschlossen",
            meta={"chunk_count": len(chunks), "raw_length": len(raw_content), "metadata_keys": sorted((metadata or {}).keys())},
        )

        # Summarize (LLM step 1)
        await _log_pipeline(db, redis, channel, doc, step=3, total=10, label="summarizing", status="running", detail="LLM erstellt Zusammenfassung")
        doc.summary = await summarize_document(raw_content)
        await db.commit()
        await _log_pipeline(db, redis, channel, doc, step=3, total=10, label="summarizing", status="done", detail="Zusammenfassung erstellt", meta={"summary_length": len(doc.summary or "")})

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
