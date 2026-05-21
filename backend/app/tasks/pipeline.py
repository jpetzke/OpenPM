"""Per-document processing pipeline.

Entry point: `process_document(ctx, document_id)`. Each document runs through
9 numbered steps. Per-project serialization is enforced by a Redis lock so two
documents in the same project never race on state-version creation; documents
in different projects run in parallel up to ARQ's max_jobs setting.

Steps:
    1 queued             — accepted into the worker
    2 parsing            — kreuzberg extraction
    3 summarize+extract  — two LLM calls run concurrently via asyncio.gather
    4 state_merge        — fold delta into current state in memory
    5 state_persist      — write new project_state row (advisory lock as safety net)
    6 changelog          — attach to active ChangeSession (or open a new one)
    7 git_commit         — commit state.json
    8 enrich             — embeddings + briefing render concurrently
    9 done               — flag the document complete, publish summary
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory
from app.models.document import Document
from app.models.project import Project
from app.models.state import ChangeSession, ProjectState, StateChangelog
from app.services import briefing as briefing_service
from app.services import change_session as change_session_service
from app.services import git_service, qdrant_service
from app.services.extraction import extract_state_delta, parse_document, summarize_document
from app.services.provider_resolver import get_active_provider
from app.services.state_manager import compute_delta, merge_state

log = structlog.get_logger()

TOTAL_STEPS = 9

_LOCK_TTL_SECONDS = 300
_LOCK_HEARTBEAT_SECONDS = 60
_REQUEUE_DELAY_SECONDS = 2

_RELEASE_LUA = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
else
    return 0
end
"""

_REFRESH_LUA = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('pexpire', KEYS[1], ARGV[2])
else
    return 0
end
"""


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _publish(redis: Any, channel: str, event: dict) -> None:
    try:
        await redis.publish(channel, json.dumps(event, default=str))
    except Exception as exc:  # noqa: BLE001
        log.warning("publish_failed", channel=channel, error=str(exc))


def _lock_key(project_id: uuid.UUID | str) -> str:
    return f"project_lock:{project_id}"


async def _acquire_project_lock(redis: Any, project_id: uuid.UUID, owner: str) -> bool:
    return bool(await redis.set(_lock_key(project_id), owner, nx=True, ex=_LOCK_TTL_SECONDS))


async def _release_project_lock(redis: Any, project_id: uuid.UUID, owner: str) -> None:
    try:
        await redis.eval(_RELEASE_LUA, 1, _lock_key(project_id), owner)
    except Exception as exc:  # noqa: BLE001
        log.warning("project_lock_release_failed", error=str(exc))


async def _heartbeat_loop(redis: Any, project_id: uuid.UUID, owner: str) -> None:
    try:
        while True:
            await asyncio.sleep(_LOCK_HEARTBEAT_SECONDS)
            try:
                await redis.eval(
                    _REFRESH_LUA,
                    1,
                    _lock_key(project_id),
                    owner,
                    _LOCK_TTL_SECONDS * 1000,
                )
            except Exception as exc:  # noqa: BLE001
                log.warning("project_lock_refresh_failed", error=str(exc))
    except asyncio.CancelledError:
        return


async def _log_pipeline(
    db: AsyncSession,
    redis: Any,
    channel: str,
    doc: Document,
    *,
    step: int,
    label: str,
    status: str,
    detail: str | None = None,
    meta: dict | None = None,
) -> None:
    entry = {
        "timestamp": _timestamp(),
        "step": step,
        "total": TOTAL_STEPS,
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
            "event": "document_progress",
            "document_id": str(doc.id),
            "step": step,
            "total": TOTAL_STEPS,
            "label": label,
            "status": status,
            "detail": detail,
            "meta": meta or {},
            "timestamp": entry["timestamp"],
        },
    )


def _extracted_summary(computed_delta: dict | None) -> dict:
    added = (computed_delta or {}).get("added", {}) or {}
    tasks = added.get("core.open_tasks", []) or []
    deadlines = added.get("core.deadlines", []) or []
    contacts = added.get("core.contacts", []) or []
    dynamic_total = 0
    for key, value in added.items():
        if key.startswith("dynamic.") and isinstance(value, list):
            dynamic_total += len(value)

    def _label(item: dict | None) -> str | None:
        if not isinstance(item, dict):
            return None
        for field in ("title", "name", "label", "description"):
            value = item.get(field)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    return {
        "contacts_added": len(contacts),
        "tasks_added": len(tasks),
        "deadlines_added": len(deadlines),
        "decisions_added": len(added.get("core.decisions", []) or []),
        "blockers_added": len(added.get("core.blockers", []) or []),
        "dynamic_items_added": dynamic_total,
        "sample": {
            "first_task": _label(tasks[0]) if tasks else None,
            "first_deadline": _label(deadlines[0]) if deadlines else None,
            "first_contact": _label(contacts[0]) if contacts else None,
        },
    }


def _translate_error(exc: Exception) -> str:
    if isinstance(exc, qdrant_service.EmbeddingDimensionMismatch):
        return (
            f"Embedding-Index inkompatibel: Collection wurde mit Dimension "
            f"{exc.expected} erstellt, der aktive Provider liefert Dimension "
            f"{exc.got}. Bitte den Embedding-Index in den Projekt-Einstellungen "
            f"neu aufbauen."
        )
    message = str(exc)
    if "Vector dimension error" in message:
        return (
            "Embedding-Dimension passt nicht zur bestehenden Collection. "
            "Embedding-Index neu aufbauen (Projekt → Embeddings)."
        )
    return message


# ─────────────────────────────── ARQ entrypoints ──────────────────────────────


async def process_document(ctx: dict, document_id: str) -> None:
    """Process one document end-to-end.

    Acquires a per-project Redis lock; re-enqueues itself with a short delay
    if another document in the same project is already being processed.
    """
    redis = ctx["redis"]
    doc_uuid = uuid.UUID(document_id)

    async with async_session_factory() as db:
        result = await db.execute(select(Document).where(Document.id == doc_uuid))
        doc = result.scalar_one_or_none()
        if doc is None:
            log.error("document_not_found", document_id=document_id)
            return
        project_id = doc.project_id

    lock_owner = uuid.uuid4().hex
    if not await _acquire_project_lock(redis, project_id, lock_owner):
        await redis.enqueue_job("process_document", document_id, _defer_by=_REQUEUE_DELAY_SECONDS)
        return

    heartbeat = asyncio.create_task(_heartbeat_loop(redis, project_id, lock_owner))
    try:
        async with async_session_factory() as db:
            await _process(db, redis, doc_uuid, project_id)
    finally:
        heartbeat.cancel()
        try:
            await heartbeat
        except Exception:  # noqa: BLE001
            pass
        await _release_project_lock(redis, project_id, lock_owner)


async def close_idle_change_sessions(ctx: dict) -> int:
    """ARQ cron: close any change session whose idle window has elapsed."""
    redis = ctx["redis"]
    async with async_session_factory() as db:
        closed = await change_session_service.close_idle(db, redis)
        await db.commit()
    return len(closed)


# ─────────────────────────────── pipeline body ────────────────────────────────


async def _process(db: AsyncSession, redis: Any, document_id: uuid.UUID, project_id: uuid.UUID) -> None:
    channel = f"pipeline:{project_id}"

    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        log.error("document_not_found", document_id=str(document_id))
        return

    try:
        doc.processing_status = "processing"
        doc.pipeline_logs = list(doc.pipeline_logs or [])
        doc.pipeline_updated_at = datetime.now(timezone.utc)
        await db.commit()

        await _publish(
            redis,
            channel,
            {
                "event": "document_started",
                "document_id": str(document_id),
                "step": 1,
                "total": TOTAL_STEPS,
                "timestamp": _timestamp(),
            },
        )

        await _log_pipeline(
            db, redis, channel, doc,
            step=1, label="queued", status="done",
            detail="Dokumentverarbeitung gestartet",
        )

        # Step 2 — parse
        from app.services.storage import get_document_bytes

        await _log_pipeline(
            db, redis, channel, doc,
            step=2, label="parsing", status="running",
            detail="Kreuzberg extrahiert Inhalt",
            meta={"mime_type": doc.mime_type, "size_bytes": doc.file_size},
        )
        file_bytes = get_document_bytes(doc.original_path)
        raw_content, metadata, chunks = await parse_document(file_bytes, doc.mime_type)
        doc.raw_content = raw_content
        doc.doc_metadata = metadata
        await db.flush()
        await _log_pipeline(
            db, redis, channel, doc,
            step=2, label="parsing", status="done",
            detail="Extraktion abgeschlossen",
            meta={
                "chunk_count": len(chunks),
                "raw_length": len(raw_content),
                "metadata_keys": sorted((metadata or {}).keys()),
            },
        )

        # Step 3 — summarize + extract in parallel (two independent LLM calls)
        # Load current state first so the extractor can see it; the load itself
        # is cheap and only the LLM round trips are slow.
        lock_key = project_id.int & 0x7FFFFFFFFFFFFFFF
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})

        state_result = await db.execute(
            select(ProjectState)
            .where(ProjectState.project_id == project_id)
            .order_by(ProjectState.version.desc())
            .limit(1)
        )
        current_state_obj = state_result.scalar_one_or_none()
        current_state = current_state_obj.state if current_state_obj else {}
        current_version = current_state_obj.version if current_state_obj else 0

        existing_for_doc_result = await db.execute(
            select(ProjectState)
            .where(
                ProjectState.project_id == project_id,
                ProjectState.triggered_by_document_id == doc.id,
            )
            .limit(1)
        )
        existing_for_doc = existing_for_doc_result.scalar_one_or_none()

        await _log_pipeline(
            db, redis, channel, doc,
            step=3, label="summarize_extract", status="running",
            detail="LLM erstellt Zusammenfassung & extrahiert State-Delta",
        )
        summary_text, delta = await asyncio.gather(
            summarize_document(raw_content),
            extract_state_delta(raw_content, current_state or None),
        )
        doc.summary = summary_text
        await db.flush()
        await _log_pipeline(
            db, redis, channel, doc,
            step=3, label="summarize_extract", status="done",
            detail="LLM-Ergebnisse vorhanden",
            meta={
                "summary_length": len(summary_text or ""),
                "dynamic_sections": len((delta or {}).get("dynamic_sections") or []),
                "custom_keys": sorted(((delta or {}).get("custom") or {}).keys()),
            },
        )

        # Step 4 — merge in memory
        new_state = merge_state(current_state, delta)
        await _log_pipeline(
            db, redis, channel, doc,
            step=4, label="state_merge", status="done",
            detail="Delta in Projekt-State integriert",
            meta={
                "core_counts": {
                    key: len(new_state.get("core", {}).get(key, []))
                    for key in ["contacts", "open_tasks", "deadlines", "decisions", "blockers"]
                },
                "dynamic_sections": len(new_state.get("dynamic_sections") or []),
            },
        )

        # Step 5 — persist new state version (idempotent on retry)
        if existing_for_doc is not None:
            existing_for_doc.state = new_state
            new_state_obj = existing_for_doc
            new_version = existing_for_doc.version
        else:
            new_version = current_version + 1
            stmt = (
                pg_insert(ProjectState)
                .values(
                    id=uuid.uuid4(),
                    project_id=project_id,
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
            persist_result = await db.execute(stmt)
            new_state_obj = persist_result.scalar_one()
            new_version = new_state_obj.version
        await db.flush()
        await _log_pipeline(
            db, redis, channel, doc,
            step=5, label="state_persist", status="done",
            detail="Neue State-Version gespeichert",
            meta={"new_version": new_version},
        )

        # Step 6 — changelog with change session attachment
        computed_delta = compute_delta(current_state, new_state)
        session_obj = await change_session_service.get_or_open(project_id, db, redis)
        changelog = StateChangelog(
            project_id=project_id,
            from_version=current_version if current_version > 0 else None,
            to_version=new_version,
            delta=computed_delta,
            document_id=doc.id,
            triggered_by="pipeline",
            change_session_id=session_obj.id,
        )
        db.add(changelog)
        await db.flush()
        await _log_pipeline(
            db, redis, channel, doc,
            step=6, label="changelog", status="done",
            detail="Changelog erzeugt",
            meta={"change_session_id": str(session_obj.id)},
        )

        # Step 7 — git commit
        commit_summary_parts = []
        added = computed_delta.get("added", {})
        for key, items in added.items():
            name = key.split(".")[-1]
            commit_summary_parts.append(f"{len(items)} {name} added")
        commit_msg = f"upload({doc.original_filename}): {', '.join(commit_summary_parts) or 'state updated'}"
        commit_hash = git_service.commit_state(str(project_id), new_state, commit_msg)
        doc.git_commit_hash = commit_hash
        changelog.git_commit_hash = commit_hash
        await db.flush()
        await _log_pipeline(
            db, redis, channel, doc,
            step=7, label="git_commit", status="done",
            detail="State in Git gesichert",
            meta={"commit_hash": commit_hash},
        )

        # Step 8 — enrich (embeddings + briefing render in parallel)
        embeddings_enabled = await get_active_provider("embedding", db) is not None
        proj_result = await db.execute(select(Project).where(Project.id == project_id))
        project = proj_result.scalar_one_or_none()
        recent_changelog_result = await db.execute(
            select(StateChangelog)
            .where(StateChangelog.project_id == project_id)
            .order_by(StateChangelog.created_at.desc())
            .limit(3)
        )
        cl_dicts = [
            {"to_version": c.to_version, "triggered_by": c.triggered_by}
            for c in recent_changelog_result.scalars().all()
        ]

        await _log_pipeline(
            db, redis, channel, doc,
            step=8, label="enrich", status="running",
            detail="Embeddings & Briefing parallel",
            meta={"embeddings_enabled": embeddings_enabled, "chunk_count": len(chunks)},
        )

        async def _embed_task() -> bool:
            if not (chunks and embeddings_enabled):
                return False
            await qdrant_service.upsert_chunks(
                str(project_id), chunks, str(doc.id), doc.original_filename
            )
            return True

        async def _briefing_task() -> str | None:
            if project is None:
                return None
            return briefing_service.render_briefing(
                {
                    "name": project.name,
                    "client_name": project.client_name,
                    "status": project.status,
                    "updated_at": project.updated_at.isoformat(),
                },
                new_state,
                new_version,
                cl_dicts,
            )

        embedded, briefing_text = await asyncio.gather(_embed_task(), _briefing_task())
        if briefing_text is not None and project is not None:
            project.compiled_briefing = briefing_text
        await _log_pipeline(
            db, redis, channel, doc,
            step=8, label="enrich", status="done",
            detail="Anreicherung abgeschlossen",
            meta={"embedded": embedded, "briefing_updated": briefing_text is not None},
        )

        # Step 9 — done
        doc.processing_status = "done"
        doc.pipeline_step = TOTAL_STEPS
        doc.pipeline_step_label = "complete"
        doc.pipeline_updated_at = datetime.now(timezone.utc)
        await db.commit()

        summary_payload = _extracted_summary(computed_delta)
        await _publish(
            redis,
            channel,
            {
                "event": "document_complete",
                "document_id": str(document_id),
                "state_version": new_version,
                "change_session_id": str(session_obj.id),
                "extracted_summary": summary_payload,
                "step": TOTAL_STEPS,
                "total": TOTAL_STEPS,
                "label": "complete",
                "status": "done",
                "timestamp": _timestamp(),
            },
        )

    except Exception as exc:  # noqa: BLE001
        err_message = _translate_error(exc)
        log.error("pipeline_failed", document_id=str(document_id), error=err_message)
        try:
            doc.processing_status = "failed"
            doc.processing_error = err_message
            logs = list(doc.pipeline_logs or [])
            logs.append({
                "timestamp": _timestamp(),
                "step": doc.pipeline_step,
                "total": TOTAL_STEPS,
                "label": doc.pipeline_step_label or "failed",
                "status": "failed",
                "detail": err_message,
                "meta": {},
            })
            doc.pipeline_logs = logs
            doc.pipeline_updated_at = datetime.now(timezone.utc)
            await db.commit()
        except Exception:  # noqa: BLE001
            pass
        await _publish(
            redis,
            channel,
            {
                "event": "document_failed",
                "document_id": str(document_id),
                "error": err_message,
                "step": doc.pipeline_step,
                "total": TOTAL_STEPS,
                "label": doc.pipeline_step_label,
                "status": "failed",
                "timestamp": _timestamp(),
            },
        )
        raise
