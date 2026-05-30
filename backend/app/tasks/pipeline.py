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
from app.services.email_parser import parse_eml
from app.services.extraction import extract_state_delta, parse_document, summarize_document
from app.services.llm import LLMInvalidJSON, LLMRateLimit, LLMServerError, LLMTimeout
from app.services.provider_resolver import get_active_provider
from app.services.state_manager import compute_delta, merge_state
from app.services.transcription import get_provider as get_transcription_provider

import traceback as _traceback

log = structlog.get_logger()

TOTAL_STEPS = 9

_LOCK_TTL_SECONDS = 300
_LOCK_HEARTBEAT_SECONDS = 60
_REQUEUE_DELAY_SECONDS = 2

# Burst-throttle: when extracted_item events fire faster than this gap,
# we insert a sleep so the UI doesn't get flooded. Capped at _THROTTLE_BUDGET_S
# total inserted delay per document, so 100 items never sleep 20s.
_THROTTLE_MIN_GAP_S = 0.05
_THROTTLE_SLEEP_S = 0.2
_THROTTLE_BUDGET_S = 5.0


# Retry matrix: error_class → (max_tries, backoff_seconds_between_attempts)
# max_tries = total number of attempts; len(backoffs) == max_tries - 1.
_RETRY_MATRIX: dict[str, tuple[int, list[float]]] = {
    "llm_rate_limit":      (5, [30.0, 60.0, 120.0, 300.0]),
    "llm_timeout":         (3, [2.0, 8.0]),
    "llm_5xx":             (3, [5.0, 15.0]),
    "embedding_failed":    (3, [10.0, 30.0]),
    "state_lock_timeout":  (3, [1.0, 3.0]),
}

_LLM_EXC_TO_CLASS: dict[type, str] = {
    LLMRateLimit:   "llm_rate_limit",
    LLMTimeout:     "llm_timeout",
    LLMServerError: "llm_5xx",
    LLMInvalidJSON: "llm_invalid_json",
}


async def _step_with_retry(name: str, fn, *, error_class: str, max_tries: int, backoffs: list[float]):
    """Run fn(), retrying up to max_tries total attempts with given inter-attempt delays."""
    for attempt in range(max_tries):
        try:
            return await fn()
        except Exception as exc:
            if attempt < max_tries - 1:
                delay = backoffs[attempt]
                log.warning(
                    "pipeline_step_retry",
                    step=name,
                    error_class=error_class,
                    attempt=attempt + 1,
                    max_tries=max_tries,
                    retry_in_s=delay,
                    error=str(exc),
                )
                await asyncio.sleep(delay)
            else:
                raise


class CancelledPipeline(Exception):
    """Raised when a Redis cancel-key is observed mid-pipeline."""


async def _check_cancel(redis: Any, job_id: str | None) -> None:
    """Raise CancelledPipeline if `cancel:{job_id}` is set in Redis."""
    if not job_id:
        return
    try:
        flag = await redis.get(f"cancel:{job_id}")
    except Exception as exc:  # noqa: BLE001
        log.warning("cancel_check_failed", job_id=job_id, error=str(exc))
        return
    if flag:
        raise CancelledPipeline()


def _item_title(item: dict) -> str:
    if not isinstance(item, dict):
        return "(unbenannt)"
    for field in ("title", "name", "summary", "label", "description"):
        value = item.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return "(unbenannt)"


def _iter_delta_items(delta: dict | None):
    """Yield (item_type, item_dict) tuples for every extractable item in a delta."""
    if not isinstance(delta, dict):
        return
    core = delta.get("core") or {}
    if isinstance(core, dict):
        for src_key, item_type in (
            ("open_tasks", "task"),
            ("contacts", "contact"),
            ("deadlines", "deadline"),
            ("decisions", "decision"),
            ("blockers", "blocker"),
        ):
            for item in core.get(src_key) or []:
                if isinstance(item, dict):
                    yield item_type, item
    for section in delta.get("dynamic_sections") or []:
        if not isinstance(section, dict):
            continue
        for item in section.get("items") or []:
            if isinstance(item, dict):
                yield "dynamic_item", item


async def _publish_extracted_items(
    redis: Any,
    channel: str,
    document_id: uuid.UUID,
    delta: dict | None,
) -> int:
    """Publish per-item SSE events with burst-throttle. Returns count."""
    last_emit_ts: float | None = None
    cumulative_delay = 0.0
    loop = asyncio.get_event_loop()
    count = 0
    for item_type, item in _iter_delta_items(delta):
        if last_emit_ts is not None and cumulative_delay < _THROTTLE_BUDGET_S:
            gap = loop.time() - last_emit_ts
            if gap < _THROTTLE_MIN_GAP_S:
                await asyncio.sleep(_THROTTLE_SLEEP_S)
                cumulative_delay += _THROTTLE_SLEEP_S
        await _publish(
            redis,
            channel,
            {
                "event": "extracted_item",
                "document_id": str(document_id),
                "type": item_type,
                "item_id": str(item.get("id") or uuid.uuid4()),
                "title": _item_title(item),
                "action": "added",
                "confidence": item.get("confidence", "high"),
                "timestamp": _timestamp(),
            },
        )
        last_emit_ts = loop.time()
        count += 1
    return count

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
    job_id = ctx.get("job_id")

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
            await _process(db, redis, doc_uuid, project_id, job_id=job_id)
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


async def mark_stale_deadlines(ctx: dict) -> dict:
    """ARQ daily cron (06:00 UTC): flag stale projects + overdue deadlines.

    Zero LLM calls. For every non-archived project:
      * set ``stale_marker`` = no activity for > STALE_DAYS days,
      * annotate pending+past deadlines in the *current* state snapshot with
        ``status="overdue"`` in place (no new version, only when changed).
    """
    from datetime import timedelta

    from app.services import stale_notice

    redis = ctx.get("redis")
    cutoff = datetime.now(timezone.utc) - timedelta(days=stale_notice.STALE_DAYS)
    marked_stale = 0
    deadline_projects = 0

    async with async_session_factory() as db:
        projects = (
            await db.execute(select(Project).where(Project.archived_at.is_(None)))
        ).scalars().all()

        for project in projects:
            new_marker = (
                project.last_activity_at is not None
                and project.last_activity_at < cutoff
            )
            if bool(project.stale_marker) != new_marker:
                project.stale_marker = new_marker
            if new_marker:
                marked_stale += 1

            latest = (
                await db.execute(
                    select(ProjectState)
                    .where(ProjectState.project_id == project.id)
                    .order_by(ProjectState.version.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if latest is not None and latest.state:
                # JSONB is change-tracked only on reassignment — copy + set.
                state_copy = dict(latest.state)
                if stale_notice.mark_overdue_in_state(state_copy):
                    latest.state = state_copy
                    deadline_projects += 1
                    if redis is not None:
                        await change_session_service._publish(
                            redis,
                            f"pipeline:{project.id}",
                            {"event": "state_changed", "sections": ["deadlines"]},
                        )

        await db.commit()

    log.info(
        "stale_cron_done",
        projects=len(projects),
        marked_stale=marked_stale,
        deadline_projects=deadline_projects,
    )
    return {"marked_stale": marked_stale, "deadline_projects": deadline_projects}


# ─────────────────────────── format routing helpers ───────────────────────────


async def _parse_with_ocr(file_bytes: bytes, mime_type: str) -> tuple[str, dict, list[str]]:
    """Parse an image via kreuzberg with force_ocr=True."""
    try:
        from kreuzberg import ChunkingConfig, ExtractionConfig, OcrConfig, extract_bytes
        from app.services.extraction import _chunk_to_text, _simple_chunk  # noqa: PLC2701
        config = ExtractionConfig(
            output_format="markdown",
            force_ocr=True,
            ocr=OcrConfig(backend="tesseract", language=settings.kreuzberg_ocr_language),
            chunking=ChunkingConfig(max_chars=512, max_overlap=100),
        )
        result = await extract_bytes(file_bytes, mime_type=mime_type, config=config)
        raw_content = result.content or ""
        metadata = result.metadata or {}
        chunks = [_chunk_to_text(c) for c in (result.chunks or [])]
        if not chunks and raw_content:
            chunks = _simple_chunk(raw_content, 512, 100)
        return raw_content, metadata, chunks
    except Exception as exc:
        raise RuntimeError(f"Image OCR failed: {exc}") from exc


async def _enqueue_eml_attachments(
    attachments: list,
    parent_doc: Document,
    project_id: uuid.UUID,
    current_user_id: uuid.UUID,
    db: AsyncSession,
    redis: Any,
    channel: str,
) -> None:
    """Create Document rows for each EML attachment and enqueue them."""
    from app.routers.documents import ALLOWED_EXTENSIONS, _source_format_from
    import structlog as _structlog
    _log = _structlog.get_logger()

    for att in attachments:
        ext = "." + att.filename.rsplit(".", 1)[-1].lower() if "." in att.filename else ""
        if ext not in ALLOWED_EXTENSIONS:
            _log.info(
                "eml_attachment_skipped",
                filename=att.filename,
                mime_type=att.mime_type,
                reason="extension_not_allowed",
            )
            continue
        try:
            # Persist attachment bytes to storage
            from app.services.storage import save_document as _save_document
            att_path = _save_document(str(project_id), att.content_bytes, att.filename)
            fmt = _source_format_from(att.filename, att.mime_type)
            sub_doc = Document(
                project_id=project_id,
                original_filename=att.filename,
                original_path=att_path,
                mime_type=att.mime_type,
                file_size=len(att.content_bytes),
                pipeline_logs=[],
                pipeline_step=0,
                pipeline_step_label="pending",
                pipeline_updated_at=datetime.now(timezone.utc),
                uploaded_by=current_user_id,
                processing_status="pending",
                source_format=fmt,
                parent_document_id=parent_doc.id,
            )
            db.add(sub_doc)
            await db.flush()
            await db.refresh(sub_doc)
            await db.commit()

            # Enqueue the sub-document through the pipeline
            from arq import create_pool as _arq_create_pool
            from arq.connections import RedisSettings as _RedisSettings
            _pool = await _arq_create_pool(_RedisSettings.from_dsn(settings.redis_url))
            try:
                await _pool.enqueue_job("process_document", str(sub_doc.id))
            finally:
                await _pool.aclose()

            await _log_pipeline(
                db, redis, channel, parent_doc,
                step=2, label="parsing", status="info",
                detail=f"Anhang eingereiht: {att.filename}",
                meta={"sub_document_id": str(sub_doc.id), "format": fmt},
            )
        except Exception as exc:  # noqa: BLE001
            _log.warning(
                "eml_attachment_enqueue_failed",
                filename=att.filename,
                error=str(exc),
            )


# ─────────────────────────────── pipeline body ────────────────────────────────


async def _process(
    db: AsyncSession,
    redis: Any,
    document_id: uuid.UUID,
    project_id: uuid.UUID,
    *,
    job_id: str | None = None,
) -> None:
    channel = f"pipeline:{project_id}"

    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        log.error("document_not_found", document_id=str(document_id))
        return

    # Prefer the doc's recorded arq_job_id over the ARQ-provided one — that's
    # what the upload/retry endpoints wrote to redis as the cancel-key.
    effective_job_id = doc.arq_job_id or job_id

    try:
        await _check_cancel(redis, effective_job_id)
        doc.processing_status = "processing"
        doc.error_class = None
        doc.processing_error = None
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

        # Step 1b — Phase 0: Transcribe (audio only)
        await _check_cancel(redis, effective_job_id)
        from app.services.storage import get_document_bytes

        file_bytes = get_document_bytes(doc.original_path)
        source_format = doc.source_format or ""

        if source_format == "audio":
            await _log_pipeline(
                db, redis, channel, doc,
                step=2, label="transcribe", status="running",
                detail="Audio wird transkribiert",
                meta={"mime_type": doc.mime_type, "size_bytes": doc.file_size},
            )
            try:
                provider = get_transcription_provider()
                transcript = await provider.transcribe(file_bytes, doc.mime_type)
            except (OSError, ImportError) as exc:
                raise RuntimeError(f"Transkription fehlgeschlagen: {exc}") from exc
            # Replace file_bytes with transcript text bytes for the parse step
            file_bytes = transcript.encode("utf-8")
            # Override mime_type so kreuzberg treats it as plain text
            _effective_mime = "text/plain"
            await _log_pipeline(
                db, redis, channel, doc,
                step=2, label="transcribe", status="done",
                detail="Transkription abgeschlossen",
                meta={"transcript_length": len(transcript)},
            )
        else:
            _effective_mime = doc.mime_type

        # Step 2 — parse
        await _log_pipeline(
            db, redis, channel, doc,
            step=2, label="parsing", status="running",
            detail="Kreuzberg extrahiert Inhalt",
            meta={"mime_type": _effective_mime, "size_bytes": doc.file_size},
        )

        # EML: parse via email_parser, enqueue attachments as sub-docs, then
        # continue pipeline with plain-text representation of the email body.
        if source_format == "eml":
            parsed_email = parse_eml(file_bytes)
            # Convert to plain text for the rest of the pipeline
            eml_text = parsed_email.to_plain_text()
            raw_content = eml_text
            metadata: dict = {
                "subject": parsed_email.subject,
                "from": parsed_email.from_addr,
                "to": parsed_email.to_addrs,
                "date": parsed_email.date,
            }
            chunks: list[str] = [eml_text] if eml_text else []
            doc.raw_content = raw_content
            doc.doc_metadata = metadata
            await db.flush()
            await _log_pipeline(
                db, redis, channel, doc,
                step=2, label="parsing", status="done",
                detail=f"E-Mail geparst — {len(parsed_email.attachments)} Anhang/Anhänge",
                meta={
                    "chunk_count": len(chunks),
                    "raw_length": len(raw_content),
                    "attachment_count": len(parsed_email.attachments),
                },
            )
            # Enqueue each attachment as a sub-document (non-blocking)
            await _enqueue_eml_attachments(
                parsed_email.attachments, doc, project_id, current_user_id=doc.uploaded_by,
                db=db, redis=redis, channel=channel,
            )
        else:
            # Image: always force OCR via kreuzberg regardless of global setting
            if source_format == "image":
                raw_content, metadata, chunks = await _parse_with_ocr(file_bytes, _effective_mime)
            else:
                raw_content, metadata, chunks = await parse_document(file_bytes, _effective_mime)
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
        await _check_cancel(redis, effective_job_id)
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
        async def _extract_fn():
            return await extract_state_delta(raw_content, current_state or None)

        async def _extract_with_llm_retry():
            exc_class_key: str | None = None
            try:
                return await _extract_fn()
            except LLMRateLimit:
                exc_class_key = "llm_rate_limit"
            except LLMTimeout:
                exc_class_key = "llm_timeout"
            except LLMServerError:
                exc_class_key = "llm_5xx"
            # exc_class_key set → first call raised a retriable error; run full retry.
            max_tries, backoffs = _RETRY_MATRIX[exc_class_key]
            return await _step_with_retry(
                "extract", _extract_fn,
                error_class=exc_class_key,
                max_tries=max_tries,
                backoffs=backoffs,
            )

        (summary_text, summary_usage), (delta, extract_usage_breakdown) = await asyncio.gather(
            summarize_document(raw_content),
            _extract_with_llm_retry(),
        )
        doc.summary = summary_text
        try:
            from app.services import metrics

            _ex_model = (extract_usage_breakdown or [{}])[0].get("model") if extract_usage_breakdown else None
            metrics.record_extraction(_ex_model, "ok")
        except Exception:  # noqa: BLE001
            pass

        # Build extraction_token_usage breakdown for the document
        all_usage: list[dict] = []
        if summary_usage:
            all_usage.append(summary_usage)
        if extract_usage_breakdown:
            all_usage.extend(extract_usage_breakdown)
        if all_usage:
            prompt_total = sum(u.get("prompt_tokens", 0) for u in all_usage)
            completion_total = sum(u.get("completion_tokens", 0) for u in all_usage)
            cost_total = sum(u.get("cost_usd", 0.0) for u in all_usage)
            doc.extraction_token_usage = {
                "prompt_total": prompt_total,
                "completion_total": completion_total,
                "cost_total_usd": cost_total,
                "breakdown": all_usage,
            }

        await db.flush()
        await _log_pipeline(
            db, redis, channel, doc,
            step=3, label="summarize_extract", status="done",
            detail="LLM-Ergebnisse vorhanden",
            meta={
                "summary_length": len(summary_text or ""),
                "dynamic_sections": len((delta or {}).get("dynamic_sections") or []),
                "custom_keys": sorted(((delta or {}).get("custom") or {}).keys()),
                "extraction_cost_usd": doc.extraction_token_usage.get("cost_total_usd") if doc.extraction_token_usage else None,
            },
        )

        # Between extract and merge — emit per-item SSE events (E1).
        # Cancel-checked before the loop; the loop's own awaits also yield control,
        # so a cancel mid-burst still gets caught by the next step's _check_cancel.
        await _check_cancel(redis, effective_job_id)
        emitted_items = await _publish_extracted_items(redis, channel, doc.id, delta)
        log.info(
            "extracted_items_emitted",
            document_id=str(doc.id),
            count=emitted_items,
        )

        # Step 4 — merge in memory
        await _check_cancel(redis, effective_job_id)
        new_state = merge_state(current_state, delta, document_id=str(doc.id))
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
        await _check_cancel(redis, effective_job_id)
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

        sections_changed: list[str] = []
        _delta_core = (delta or {}).get("core") or {}
        for _src_key, _section_key in (
            ("open_tasks", "tasks"),
            ("contacts", "contacts"),
            ("deadlines", "deadlines"),
            ("decisions", "decisions"),
            ("blockers", "blockers"),
        ):
            if _delta_core.get(_src_key):
                sections_changed.append(_section_key)
        if (delta or {}).get("dynamic_sections"):
            sections_changed.append("dynamic_sections")
        await _publish(
            redis,
            channel,
            {
                "event": "state_changed",
                "project_id": str(project_id),
                "version": new_version,
                "sections": sections_changed,
                "timestamp": _timestamp(),
            },
        )

        # Step 6 — changelog with change session attachment
        await _check_cancel(redis, effective_job_id)
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
        await _check_cancel(redis, effective_job_id)
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
        await _check_cancel(redis, effective_job_id)
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
        docs_result = await db.execute(
            select(Document).where(Document.project_id == project_id)
        )
        documents_by_id = {str(d.id): d for d in docs_result.scalars().all()}

        await _log_pipeline(
            db, redis, channel, doc,
            step=8, label="enrich", status="running",
            detail="Embeddings & Briefing parallel",
            meta={"embeddings_enabled": embeddings_enabled, "chunk_count": len(chunks)},
        )

        async def _embed_core() -> bool:
            if not (chunks and embeddings_enabled):
                return False
            await qdrant_service.upsert_chunks(
                str(project_id), chunks, str(doc.id), doc.original_filename
            )
            return True

        async def _embed_task() -> bool:
            embed_max, embed_backoffs = _RETRY_MATRIX["embedding_failed"]
            return await _step_with_retry(
                "embed", _embed_core,
                error_class="embedding_failed",
                max_tries=embed_max,
                backoffs=embed_backoffs,
            )

        async def _briefing_task() -> briefing_service.BriefingResult | None:
            if project is None:
                return None
            # Cache skip: if briefing was already rendered for this state version, skip
            if (
                project.briefing_state_version == new_version
                and project.compiled_briefing
            ):
                log.info("briefing_cached", project_id=str(project_id), state_version=new_version)
                return None  # None signals "cached, skip update"
            priority_order = project.briefing_priority_order or None
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
                documents_by_id=documents_by_id,
                priority_order=priority_order,
            )

        embed_result, briefing_result = await asyncio.gather(
            _embed_task(), _briefing_task(), return_exceptions=True
        )
        embed_failed = isinstance(embed_result, BaseException)
        embedded = not embed_failed and bool(embed_result)

        if embed_failed:
            log.warning(
                "pipeline_embed_all_retries_failed",
                document_id=str(doc.id),
                error=str(embed_result),
            )
            doc.processing_status = "completed_partial"
            doc.error_class = "embedding_failed"
            doc.processing_error = str(embed_result)

        briefing_cached = False
        if isinstance(briefing_result, BaseException):
            briefing_result = None
        if briefing_result is None and project is not None and project.briefing_state_version == new_version:
            # None from cached path
            briefing_cached = True
        if briefing_result is not None and project is not None:
            project.compiled_briefing = briefing_result.text
            project.briefing_token_count = briefing_result.token_count
            project.briefing_was_truncated = briefing_result.was_truncated
            project.briefing_state_version = new_version
        await _log_pipeline(
            db, redis, channel, doc,
            step=8, label="enrich", status="done",
            detail="Anreicherung abgeschlossen",
            meta={
                "embedded": embedded,
                "embed_failed": embed_failed,
                "briefing_updated": briefing_result is not None,
                "briefing_cached": briefing_cached,
            },
        )

        # Step 9 — done (preserve completed_partial if embedding failed)
        if doc.processing_status != "completed_partial":
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

    except CancelledPipeline:
        log.info("pipeline_cancelled", document_id=str(document_id))
        try:
            # Discard any uncommitted state changes from this run so we don't
            # accidentally persist a half-merged ProjectState.
            await db.rollback()
            result = await db.execute(select(Document).where(Document.id == document_id))
            doc_fresh = result.scalar_one_or_none()
            if doc_fresh is not None:
                doc_fresh.processing_status = "cancelled"
                doc_fresh.pipeline_updated_at = datetime.now(timezone.utc)
                await db.commit()
        except Exception:  # noqa: BLE001
            pass
        await _publish(
            redis,
            channel,
            {
                "event": "pipeline_cancelled",
                "document_id": str(document_id),
                "timestamp": _timestamp(),
            },
        )
        return

    except Exception as exc:  # noqa: BLE001
        err_message = _translate_error(exc)
        log.error("pipeline_failed", document_id=str(document_id), error=err_message)
        classified = _LLM_EXC_TO_CLASS.get(type(exc))
        error_class = classified if classified else type(exc).__name__[:64]
        try:
            from app.services import metrics

            metrics.record_pipeline_error(error_class)
        except Exception:  # noqa: BLE001
            pass
        try:
            doc.processing_status = "failed"
            doc.processing_error = err_message
            doc.error_class = error_class
            tb_str = _traceback.format_exc() if settings.debug_tracebacks else None
            log_entry: dict = {
                "timestamp": _timestamp(),
                "step": doc.pipeline_step,
                "total": TOTAL_STEPS,
                "label": doc.pipeline_step_label or "failed",
                "status": "failed",
                "detail": err_message,
                "meta": {},
            }
            if tb_str:
                log_entry["traceback"] = tb_str
            logs = list(doc.pipeline_logs or [])
            logs.append(log_entry)
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
