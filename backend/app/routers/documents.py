import copy
import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_project_member
from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.models.project import ProjectMember
from app.models.state import ProjectState, StateChangelog
from app.models.user import User
from app.schemas.document import (
    ArchiveSummary,
    DiffItem,
    DiffPreview,
    DocumentResponse,
    DocumentUploadResponse,
    TextDocumentCreate,
)
from app.services import change_session as change_session_service
from app.services import git_service
from app.services import storage as storage_service
from app.services.provider_resolver import get_active_provider
from app.services.state_manager import compute_delta, merge_state, remove_document_source
from app.services.storage import UploadTooLarge

log = structlog.get_logger()

router = APIRouter(prefix="/api/projects/{project_id}/documents", tags=["documents"])

# Extension allow-list — keep aligned with kreuzberg's parser coverage.
ALLOWED_EXTENSIONS = {
    # Documents / text
    ".pdf", ".txt", ".md", ".markdown", ".csv",
    ".docx", ".doc", ".xlsx", ".xls", ".rtf",
    ".json", ".html", ".htm", ".log",
    # Email
    ".eml",
    # Images (OCR via kreuzberg)
    ".png", ".jpg", ".jpeg", ".webp",
    # Audio (Whisper transcription)
    ".mp3", ".m4a", ".wav", ".ogg",
}

# MIME-type based format detection used by upload route and pipeline.
def _source_format_from(filename: str | None, mime_type: str | None) -> str:
    """Return a canonical source_format string for a given filename + mime."""
    mt = (mime_type or "").lower()
    ext = _extension(filename)
    if mt.startswith("image/") or ext in {".png", ".jpg", ".jpeg", ".webp"}:
        return "image"
    if mt.startswith("audio/") or ext in {".mp3", ".m4a", ".wav", ".ogg"}:
        return "audio"
    if mt == "message/rfc822" or ext == ".eml":
        return "eml"
    if mt == "application/pdf" or ext == ".pdf":
        return "pdf"
    if mt in {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    } or ext in {".docx", ".doc"}:
        return "docx"
    if mt in {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv",
    } or ext in {".xlsx", ".xls", ".csv"}:
        return "spreadsheet"
    if mt == "text/html" or ext in {".html", ".htm"}:
        return "html"
    if mt == "application/json" or ext == ".json":
        return "json"
    if mt == "application/rtf" or ext == ".rtf":
        return "rtf"
    if ext == ".log":
        return "log"
    if mt in {"text/plain", "text/markdown"} or ext in {".txt", ".md", ".markdown"}:
        return "txt"
    return "other"


def _extension(filename: str | None) -> str:
    if not filename:
        return ""
    return Path(filename).suffix.lower()


def _reject_unsupported_type(filename: str | None, mime_type: str | None = None) -> None:
    ext = _extension(filename)
    mt = (mime_type or "").lower()
    if ext in ALLOWED_EXTENSIONS:
        return
    if mt.startswith("image/") or mt.startswith("audio/") or mt == "message/rfc822":
        return
    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail={
            "code": "unsupported_media_type",
            "extension": ext or None,
            "allowed": sorted(ALLOWED_EXTENSIONS),
            "hint": "Inhalt als Text einfügen?",
        },
    )


async def _redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


async def _enqueue_pipeline(document_id: str, job_id: str | None = None) -> None:
    try:
        from arq import create_pool
        from arq.connections import RedisSettings
        redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        kwargs = {"_job_id": job_id} if job_id else {}
        await redis.enqueue_job("process_document", document_id, **kwargs)
        await redis.aclose()
    except Exception as exc:
        log.error("enqueue_pipeline_failed", document_id=document_id, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="queue_unavailable",
        ) from exc


async def _publish(channel: str, event: dict) -> None:
    redis = await _redis()
    try:
        await redis.publish(channel, json.dumps(event, default=str))
    finally:
        await redis.aclose()


async def _get_doc_or_404(project_id: uuid.UUID, doc_id: uuid.UUID, db: AsyncSession) -> Document:
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc


def _new_document_row(
    *,
    project_id: uuid.UUID,
    original_filename: str,
    original_path: str,
    mime_type: str,
    file_size: int,
    uploaded_by: uuid.UUID,
    source_format: str | None = None,
    parent_document_id: uuid.UUID | None = None,
) -> Document:
    return Document(
        project_id=project_id,
        original_filename=original_filename,
        original_path=original_path,
        mime_type=mime_type,
        file_size=file_size,
        pipeline_logs=[],
        pipeline_step=0,
        pipeline_step_label="pending",
        pipeline_updated_at=datetime.now(timezone.utc),
        uploaded_by=uploaded_by,
        processing_status="pending",
        source_format=source_format,
        parent_document_id=parent_document_id,
    )


async def _attach_change_session(project_id: uuid.UUID, db: AsyncSession) -> uuid.UUID:
    """Return the active change session id, opening one if needed."""
    redis = await _redis()
    try:
        session = await change_session_service.get_or_open(project_id, db, redis)
        await db.commit()
        return session.id
    finally:
        await redis.aclose()


async def _publish_queued(
    project_id: uuid.UUID,
    doc: Document,
    change_session_id: uuid.UUID,
) -> None:
    await _publish(
        f"pipeline:{project_id}",
        {
            "event": "document_queued",
            "document_id": str(doc.id),
            "filename": doc.original_filename,
            "queued_at": datetime.now(timezone.utc).isoformat(),
            "change_session_id": str(change_session_id),
        },
    )


async def _get_current_project_state(project_id: uuid.UUID, db: AsyncSession) -> tuple[dict, int]:
    """Return (state_dict, version) for the latest ProjectState, or ({}, 0) if none."""
    result = await db.execute(
        select(ProjectState)
        .where(ProjectState.project_id == project_id)
        .order_by(ProjectState.version.desc())
        .limit(1)
    )
    ps = result.scalar_one_or_none()
    if ps is None:
        return {}, 0
    return dict(ps.state), ps.version


async def _persist_state_version(
    project_id: uuid.UUID,
    old_state: dict,
    new_state: dict,
    old_version: int,
    triggered_by: str,
    document_id: uuid.UUID | None,
    db: AsyncSession,
) -> tuple[ProjectState, StateChangelog]:
    new_version = old_version + 1
    ps = ProjectState(
        project_id=project_id,
        version=new_version,
        state=new_state,
        triggered_by_document_id=document_id,
    )
    db.add(ps)
    await db.flush()

    delta = compute_delta(old_state, new_state)
    cl = StateChangelog(
        project_id=project_id,
        from_version=old_version if old_version > 0 else None,
        to_version=new_version,
        delta=delta,
        document_id=document_id,
        triggered_by=triggered_by,
    )
    db.add(cl)
    await db.flush()
    return ps, cl


def _items_from_state(state: dict) -> list[tuple[str, dict]]:
    """Yield (section_key, item) tuples from all state sections."""
    items = []
    core = state.get("core") or {}
    for key in ("contacts", "open_tasks", "deadlines", "decisions", "blockers"):
        for item in core.get(key) or []:
            items.append((key, item))
    for section in state.get("dynamic_sections") or []:
        for item in section.get("items") or []:
            items.append((section.get("title", "dynamic"), item))
    return items


def _build_diff_preview(old_state: dict, new_state: dict) -> DiffPreview:
    def _item_title(item: dict) -> str:
        return item.get("title") or item.get("name") or item.get("description") or ""

    def _item_type(key: str) -> str:
        mapping = {
            "contacts": "contact", "open_tasks": "task",
            "deadlines": "deadline", "decisions": "decision", "blockers": "blocker",
        }
        return mapping.get(key, "item")

    old_items = {item.get("id"): (key, item) for key, item in _items_from_state(old_state)}
    new_items = {item.get("id"): (key, item) for key, item in _items_from_state(new_state)}

    old_ids = set(old_items)
    new_ids = set(new_items)

    additions = [
        DiffItem(type=_item_type(k), title=_item_title(i))
        for _id, (k, i) in new_items.items() if _id not in old_ids
    ]
    removals = [
        DiffItem(type=_item_type(k), title=_item_title(i))
        for _id, (k, i) in old_items.items() if _id not in new_ids
    ]
    modifications = []
    for _id in old_ids & new_ids:
        ok, oi = old_items[_id]
        nk, ni = new_items[_id]
        if oi != ni:
            modifications.append(DiffItem(type=_item_type(nk), title=_item_title(ni)))

    return DiffPreview(additions=additions, removals=removals, modifications=modifications)


# ────────────────────────────────── endpoints ─────────────────────────────────


@router.post("", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    allow_duplicate: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(get_project_member),
):
    if await get_active_provider("llm", db) is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="no_active_llm_provider",
        )

    mime_type = file.content_type or "application/octet-stream"
    _reject_unsupported_type(file.filename, mime_type)

    try:
        original_path, total_bytes = await storage_service.stream_document_to_disk(
            str(project_id),
            file.filename or "upload",
            file.read,
            max_bytes=settings.max_upload_bytes,
        )
    except UploadTooLarge as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "file_too_large", "limit_bytes": exc.limit},
        )

    file_bytes = storage_service.get_document_bytes(original_path)
    content_hash = hashlib.sha256(file_bytes).hexdigest()

    if not allow_duplicate:
        dup_result = await db.execute(
            select(Document).where(
                Document.project_id == project_id,
                Document.content_hash == content_hash,
            )
        )
        existing = dup_result.scalars().first()
        if existing is not None:
            storage_service.delete_document(original_path)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "duplicate",
                    "existing_document_id": str(existing.id),
                    "filename": existing.original_filename,
                },
            )

    mime_type = file.content_type or "application/octet-stream"
    source_format = _source_format_from(file.filename, mime_type)
    doc = _new_document_row(
        project_id=project_id,
        original_filename=file.filename or "upload",
        original_path=original_path,
        mime_type=mime_type,
        file_size=total_bytes,
        uploaded_by=current_user.id,
        source_format=source_format,
    )
    doc.content_hash = content_hash
    arq_job_id = str(uuid.uuid4())
    doc.arq_job_id = arq_job_id
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    change_session_id = await _attach_change_session(project_id, db)
    await db.refresh(doc)
    await _publish_queued(project_id, doc, change_session_id)
    await _enqueue_pipeline(str(doc.id), job_id=arq_job_id)
    return DocumentUploadResponse(document=DocumentResponse.model_validate(doc), change_session_id=change_session_id)


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    project_id: uuid.UUID,
    include_archived: bool = False,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    q = select(Document).where(Document.project_id == project_id)
    if not include_archived:
        q = q.where(Document.archived_at.is_(None))
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/text", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def create_text_document(
    project_id: uuid.UUID,
    payload: TextDocumentCreate,
    allow_duplicate: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(get_project_member),
):
    if await get_active_provider("llm", db) is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="no_active_llm_provider",
        )

    content_bytes = payload.content.encode("utf-8")
    if len(content_bytes) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "file_too_large", "limit_bytes": settings.max_upload_bytes},
        )

    content_hash = hashlib.sha256(content_bytes).hexdigest()
    if not allow_duplicate:
        dup_result = await db.execute(
            select(Document).where(
                Document.project_id == project_id,
                Document.content_hash == content_hash,
            )
        )
        existing = dup_result.scalars().first()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "duplicate",
                    "existing_document_id": str(existing.id),
                    "filename": existing.original_filename,
                },
            )

    original_path = storage_service.save_document(
        str(project_id), content_bytes, f"{payload.title}.txt"
    )

    doc = _new_document_row(
        project_id=project_id,
        original_filename=f"{payload.title}.txt",
        original_path=original_path,
        mime_type="text/plain",
        file_size=len(content_bytes),
        uploaded_by=current_user.id,
    )
    doc.content_hash = content_hash
    arq_job_id = str(uuid.uuid4())
    doc.arq_job_id = arq_job_id
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    change_session_id = await _attach_change_session(project_id, db)
    await db.refresh(doc)
    await _publish_queued(project_id, doc, change_session_id)
    await _enqueue_pipeline(str(doc.id), job_id=arq_job_id)
    return DocumentUploadResponse(document=DocumentResponse.model_validate(doc), change_session_id=change_session_id)


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    return await _get_doc_or_404(project_id, doc_id, db)


@router.get("/{doc_id}/download")
async def download_document(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    from fastapi.responses import Response
    doc = await _get_doc_or_404(project_id, doc_id, db)
    file_bytes = storage_service.get_document_bytes(doc.original_path)
    return Response(
        content=file_bytes,
        media_type=doc.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{doc.original_filename}"'},
    )


@router.delete("/{doc_id}")
async def delete_document(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    cancel_pipeline: bool = False,
    strategy: str = "soft",
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    doc = await _get_doc_or_404(project_id, doc_id, db)

    if cancel_pipeline:
        redis = await _redis()
        try:
            if doc.arq_job_id:
                await redis.set(f"cancel:{doc.arq_job_id}", "1", ex=3600)
        finally:
            await redis.aclose()
        doc.processing_status = "cancelled"
        doc.pipeline_updated_at = datetime.now(timezone.utc)
        await db.commit()
        await _publish(
            f"pipeline:{project_id}",
            {
                "event": "pipeline_cancelled",
                "document_id": str(doc_id),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        return

    from app.services import qdrant_service

    if strategy == "git_revert":
        # Find the first ProjectState version that contains this doc as a source.
        all_versions_result = await db.execute(
            select(ProjectState)
            .where(ProjectState.project_id == project_id)
            .order_by(ProjectState.version.asc())
        )
        all_versions = list(all_versions_result.scalars().all())

        first_with_doc_idx = None
        for i, ps in enumerate(all_versions):
            state_str = json.dumps(ps.state)
            if str(doc_id) in state_str:
                first_with_doc_idx = i
                break

        if first_with_doc_idx is None or first_with_doc_idx == 0:
            target_state: dict = {}
        else:
            target_state = dict(all_versions[first_with_doc_idx - 1].state)

        current_ps = all_versions[-1] if all_versions else None
        old_version = current_ps.version if current_ps else 0
        old_state = dict(current_ps.state) if current_ps else {}

        commit_hash = git_service.revert_to_version(
            str(project_id), target_state, f"revert: drop {doc_id}"
        )

        ps_new, cl = await _persist_state_version(
            project_id=project_id,
            old_state=old_state,
            new_state=target_state,
            old_version=old_version,
            triggered_by="document_revert",
            document_id=doc.id,
            db=db,
        )
        cl.git_commit_hash = commit_hash
        await db.flush()

        doc.archived_at = datetime.now(timezone.utc)
        try:
            await qdrant_service.delete_by_document(str(project_id), str(doc_id))
        except Exception as exc:
            log.error("qdrant_delete_failed", project_id=str(project_id), document_id=str(doc_id), error=str(exc))

        await db.commit()
        await _publish(
            f"pipeline:{project_id}",
            {
                "event": "document_archived",
                "document_id": str(doc_id),
                "project_id": str(project_id),
                "version": ps_new.version,
                "strategy": "git_revert",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        return {"document_id": str(doc_id), "version": ps_new.version, "strategy": "git_revert"}

    # Default: soft delete + state recomposition
    old_state, old_version = await _get_current_project_state(project_id, db)
    new_state = copy.deepcopy(old_state)
    summary = remove_document_source(new_state, str(doc_id))

    ps_new, cl = await _persist_state_version(
        project_id=project_id,
        old_state=old_state,
        new_state=new_state,
        old_version=old_version,
        triggered_by="document_delete",
        document_id=doc.id,
        db=db,
    )

    try:
        commit_hash = git_service.commit_state(
            str(project_id), new_state, f"archive: remove {doc_id}"
        )
        cl.git_commit_hash = commit_hash
        await db.flush()
    except Exception as exc:
        log.warning("git_commit_failed_on_archive", error=str(exc))

    doc.archived_at = datetime.now(timezone.utc)

    try:
        await qdrant_service.delete_by_document(str(project_id), str(doc_id))
    except Exception as exc:
        log.error("qdrant_delete_failed", project_id=str(project_id), document_id=str(doc_id), error=str(exc))

    await db.commit()

    await _publish(
        f"pipeline:{project_id}",
        {
            "event": "document_archived",
            "document_id": str(doc_id),
            "project_id": str(project_id),
            "version": ps_new.version,
            "removed": summary["removed_count"],
            "orphaned": summary["orphaned_count"],
            "retained": summary["retained_count"],
            "strategy": "soft",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )

    return ArchiveSummary(
        document_id=str(doc_id),
        removed_count=summary["removed_count"],
        orphaned_count=summary["orphaned_count"],
        retained_count=summary["retained_count"],
        version=ps_new.version,
        strategy="soft",
    )


@router.post("/{doc_id}/restore", response_model=DocumentResponse)
async def restore_document(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    doc = await _get_doc_or_404(project_id, doc_id, db)
    doc.archived_at = None
    doc.processing_status = "pending"
    doc.processing_error = None
    doc.pipeline_step = 0
    doc.pipeline_step_label = "pending"
    doc.pipeline_updated_at = datetime.now(timezone.utc)
    new_job_id = str(uuid.uuid4())
    doc.arq_job_id = new_job_id
    await db.commit()
    await db.refresh(doc)
    await _enqueue_pipeline(str(doc.id), job_id=new_job_id)
    return doc


@router.post("/{doc_id}/replace")
async def replace_document(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    file: UploadFile = File(...),
    dry_run: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(get_project_member),
):
    old_doc = await _get_doc_or_404(project_id, doc_id, db)

    _reject_unsupported_type(file.filename)

    if dry_run:
        file_bytes = await file.read()
        mime_type = file.content_type or "application/octet-stream"

        from app.services.extraction import extract_state_delta, parse_document

        current_state, _ = await _get_current_project_state(project_id, db)
        simulated_base = copy.deepcopy(current_state)
        remove_document_source(simulated_base, str(doc_id))

        raw_text, _meta, _chunks = await parse_document(file_bytes, mime_type)
        delta, _extract_usage = await extract_state_delta(raw_text, simulated_base)

        new_doc_id_sim = str(uuid.uuid4())
        simulated_new = merge_state(simulated_base, delta, document_id=new_doc_id_sim)

        diff = _build_diff_preview(current_state, simulated_new)
        return diff

    # Commit path
    if await get_active_provider("llm", db) is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="no_active_llm_provider",
        )

    try:
        original_path, total_bytes = await storage_service.stream_document_to_disk(
            str(project_id),
            file.filename or "upload",
            file.read,
            max_bytes=settings.max_upload_bytes,
        )
    except UploadTooLarge as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "file_too_large", "limit_bytes": exc.limit},
        )

    file_bytes = storage_service.get_document_bytes(original_path)
    content_hash = hashlib.sha256(file_bytes).hexdigest()
    mime_type = file.content_type or "application/octet-stream"

    new_doc = _new_document_row(
        project_id=project_id,
        original_filename=file.filename or "upload",
        original_path=original_path,
        mime_type=mime_type,
        file_size=total_bytes,
        uploaded_by=current_user.id,
    )
    new_doc.content_hash = content_hash
    new_doc.replaces_document_id = old_doc.id
    arq_job_id = str(uuid.uuid4())
    new_doc.arq_job_id = arq_job_id
    db.add(new_doc)
    await db.flush()

    # Archive old doc + recompose state
    old_state, old_version = await _get_current_project_state(project_id, db)
    intermediate_state = copy.deepcopy(old_state)
    remove_document_source(intermediate_state, str(doc_id))

    ps_new, cl = await _persist_state_version(
        project_id=project_id,
        old_state=old_state,
        new_state=intermediate_state,
        old_version=old_version,
        triggered_by="replace",
        document_id=old_doc.id,
        db=db,
    )

    try:
        commit_hash = git_service.commit_state(
            str(project_id), intermediate_state, f"replace: archive {doc_id}"
        )
        cl.git_commit_hash = commit_hash
        await db.flush()
    except Exception as exc:
        log.warning("git_commit_failed_on_replace", error=str(exc))

    old_doc.archived_at = datetime.now(timezone.utc)

    from app.services import qdrant_service
    try:
        await qdrant_service.delete_by_document(str(project_id), str(doc_id))
    except Exception as exc:
        log.error("qdrant_delete_failed_on_replace", project_id=str(project_id), document_id=str(doc_id), error=str(exc))

    await db.commit()
    await db.refresh(new_doc)

    change_session_id = await _attach_change_session(project_id, db)
    await db.refresh(new_doc)
    await _publish_queued(project_id, new_doc, change_session_id)
    await _enqueue_pipeline(str(new_doc.id), job_id=arq_job_id)

    return DocumentResponse.model_validate(new_doc)


@router.post("/{doc_id}/retry", response_model=DocumentResponse)
async def retry_document(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    doc = await _get_doc_or_404(project_id, doc_id, db)
    if doc.processing_status not in ("failed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "not_retryable",
                "processing_status": doc.processing_status,
            },
        )
    doc.processing_error = None
    doc.error_class = None
    doc.pipeline_step = None
    doc.pipeline_step_label = None
    doc.processing_status = "pending"
    doc.retry_count = (doc.retry_count or 0) + 1
    new_job_id = str(uuid.uuid4())
    doc.arq_job_id = new_job_id
    doc.pipeline_updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(doc)
    await _enqueue_pipeline(str(doc.id), job_id=new_job_id)
    return doc


@router.post("/{doc_id}/reprocess", response_model=DocumentResponse)
async def reprocess_document(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    doc = await _get_doc_or_404(project_id, doc_id, db)
    if doc.processing_status not in ("failed", "done"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document not in reprocessable state",
        )
    doc.processing_status = "pending"
    doc.processing_error = None
    doc.summary = None
    existing_logs = list(doc.pipeline_logs or [])
    existing_logs.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "step": 0,
        "total": 9,
        "label": "reprocess",
        "status": "info",
        "detail": "Neuverarbeitung gestartet",
        "meta": {},
    })
    doc.pipeline_logs = existing_logs
    doc.pipeline_step = 0
    doc.pipeline_step_label = "pending"
    doc.pipeline_updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(doc)
    change_session_id = await _attach_change_session(project_id, db)
    await db.refresh(doc)
    await _publish_queued(project_id, doc, change_session_id)
    await _enqueue_pipeline(str(doc.id))
    return doc
