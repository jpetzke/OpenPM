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
from app.models.user import User
from app.schemas.document import (
    DocumentResponse,
    DocumentUploadResponse,
    TextDocumentCreate,
)
from app.services import change_session as change_session_service
from app.services import storage as storage_service
from app.services.provider_resolver import get_active_provider
from app.services.storage import UploadTooLarge

log = structlog.get_logger()

router = APIRouter(prefix="/api/projects/{project_id}/documents", tags=["documents"])

# Extension allow-list — keep aligned with kreuzberg's parser coverage.
ALLOWED_EXTENSIONS = {
    ".pdf", ".txt", ".md", ".markdown", ".csv",
    ".docx", ".doc", ".xlsx", ".xls", ".rtf",
    ".json", ".html", ".htm", ".log",
}


def _extension(filename: str | None) -> str:
    if not filename:
        return ""
    return Path(filename).suffix.lower()


def _reject_unsupported_type(filename: str | None) -> None:
    ext = _extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"code": "unsupported_media_type", "extension": ext or None, "allowed": sorted(ALLOWED_EXTENSIONS)},
        )


async def _redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


async def _enqueue_pipeline(document_id: str) -> None:
    try:
        from arq import create_pool
        from arq.connections import RedisSettings
        redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        await redis.enqueue_job("process_document", document_id)
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


# ────────────────────────────────── endpoints ─────────────────────────────────


@router.post("", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(get_project_member),
):
    if await get_active_provider("llm", db) is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="no_active_llm_provider",
        )

    _reject_unsupported_type(file.filename)

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

    mime_type = file.content_type or "application/octet-stream"
    doc = _new_document_row(
        project_id=project_id,
        original_filename=file.filename or "upload",
        original_path=original_path,
        mime_type=mime_type,
        file_size=total_bytes,
        uploaded_by=current_user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    change_session_id = await _attach_change_session(project_id, db)
    await db.refresh(doc)
    await _publish_queued(project_id, doc, change_session_id)
    await _enqueue_pipeline(str(doc.id))
    return DocumentUploadResponse(document=DocumentResponse.model_validate(doc), change_session_id=change_session_id)


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    result = await db.execute(select(Document).where(Document.project_id == project_id))
    return result.scalars().all()


@router.post("/text", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def create_text_document(
    project_id: uuid.UUID,
    payload: TextDocumentCreate,
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
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    change_session_id = await _attach_change_session(project_id, db)
    await db.refresh(doc)
    await _publish_queued(project_id, doc, change_session_id)
    await _enqueue_pipeline(str(doc.id))
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


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    from app.services import qdrant_service
    doc = await _get_doc_or_404(project_id, doc_id, db)
    storage_service.delete_document(doc.original_path)
    try:
        await qdrant_service.delete_by_document(str(project_id), str(doc_id))
    except Exception as exc:
        log.error(
            "qdrant_delete_failed",
            project_id=str(project_id),
            document_id=str(doc_id),
            error=str(exc),
            exc_info=True,
        )
    await db.delete(doc)
    await db.commit()
    await _publish(
        f"pipeline:{project_id}",
        {
            "event": "document_deleted",
            "document_id": str(doc_id),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


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
