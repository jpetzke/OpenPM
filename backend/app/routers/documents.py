import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_project_member
from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.models.project import ProjectMember
from app.models.user import User
from app.schemas.document import DocumentResponse, TextDocumentCreate
from app.services import storage as storage_service

router = APIRouter(prefix="/api/projects/{project_id}/documents", tags=["documents"])


async def _enqueue_pipeline(document_id: str) -> None:
    from arq import create_pool
    from arq.connections import RedisSettings
    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await redis.enqueue_job("process_document", document_id)
    await redis.aclose()


async def _schedule_batch(project_id: str, doc_id: str) -> None:
    """Add a document to the project's pending batch, resetting the 10-second processing window.

    Every upload refreshes the 'process after' timestamp, so the batch job only fires
    10 seconds after the *last* upload in the window. Each upload enqueues its own
    deferred ARQ job; jobs that arrive before the window closes exit immediately.
    """
    import time
    from arq import create_pool
    from arq.connections import RedisSettings
    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await redis.sadd(f"pending_batch:{project_id}", doc_id)
    # Always overwrite the trigger timestamp — this is what resets the clock
    trigger_at = time.time() + 10
    await redis.set(f"batch_trigger:{project_id}", str(trigger_at), ex=30)
    # Each upload schedules its own check job; most will exit early
    await redis.enqueue_job("process_project_batch", project_id, _defer_by=11)
    await redis.aclose()


async def _get_doc_or_404(project_id: uuid.UUID, doc_id: uuid.UUID, db: AsyncSession) -> Document:
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(get_project_member),
):
    file_bytes = await file.read()
    if len(file_bytes) > settings.max_upload_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")

    original_path = storage_service.save_document(str(project_id), file_bytes, file.filename or "upload")
    mime_type = file.content_type or "application/octet-stream"

    doc = Document(
        project_id=project_id,
        original_filename=file.filename or "upload",
        original_path=original_path,
        mime_type=mime_type,
        file_size=len(file_bytes),
        pipeline_logs=[],
        pipeline_step=0,
        pipeline_step_label="pending",
        pipeline_updated_at=datetime.now(timezone.utc),
        uploaded_by=current_user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    await _schedule_batch(str(project_id), str(doc.id))
    return doc


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    result = await db.execute(select(Document).where(Document.project_id == project_id))
    return result.scalars().all()


@router.post("/text", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_text_document(
    project_id: uuid.UUID,
    payload: TextDocumentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(get_project_member),
):
    content_bytes = payload.content.encode("utf-8")
    original_path = storage_service.save_document(str(project_id), content_bytes, f"{payload.title}.txt")

    doc = Document(
        project_id=project_id,
        original_filename=f"{payload.title}.txt",
        original_path=original_path,
        mime_type="text/plain",
        file_size=len(content_bytes),
        pipeline_logs=[],
        pipeline_step=0,
        pipeline_step_label="pending",
        pipeline_updated_at=datetime.now(timezone.utc),
        uploaded_by=current_user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    await _schedule_batch(str(project_id), str(doc.id))
    return doc


async def _arq_redis(project_id_str: str | None = None):
    from arq import create_pool
    from arq.connections import RedisSettings
    return await create_pool(RedisSettings.from_dsn(settings.redis_url))


@router.post("/batch/trigger", status_code=status.HTTP_204_NO_CONTENT)
async def trigger_batch_now(
    project_id: uuid.UUID,
    _member: ProjectMember = Depends(get_project_member),
):
    """Skip the countdown and process the pending batch immediately."""
    import time
    redis = await _arq_redis()
    count = await redis.scard(f"pending_batch:{project_id}")
    if count:
        await redis.set(f"batch_trigger:{project_id}", str(time.time() - 1), ex=30)
        await redis.enqueue_job("process_project_batch", str(project_id))
    await redis.aclose()


@router.post("/batch/pause", status_code=status.HTTP_204_NO_CONTENT)
async def pause_batch(
    project_id: uuid.UUID,
    _member: ProjectMember = Depends(get_project_member),
):
    """Pause the pending batch by pushing the trigger far into the future."""
    import time
    redis = await _arq_redis()
    await redis.set(f"batch_trigger:{project_id}", str(time.time() + 3600), ex=7200)
    await redis.aclose()


@router.post("/batch/resume", status_code=status.HTTP_204_NO_CONTENT)
async def resume_batch(
    project_id: uuid.UUID,
    _member: ProjectMember = Depends(get_project_member),
):
    """Resume a paused batch — reset the trigger to now + 10 seconds."""
    import time
    redis = await _arq_redis()
    await redis.set(f"batch_trigger:{project_id}", str(time.time() + 10), ex=30)
    await redis.enqueue_job("process_project_batch", str(project_id), _defer_by=11)
    await redis.aclose()


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
    except Exception:
        pass
    await db.delete(doc)
    await db.commit()


@router.post("/{doc_id}/reprocess", response_model=DocumentResponse)
async def reprocess_document(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    doc = await _get_doc_or_404(project_id, doc_id, db)
    if doc.processing_status not in ("failed", "done"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Document not in reprocessable state")
    doc.processing_status = "pending"
    doc.processing_error = None
    doc.summary = None
    existing_logs = list(doc.pipeline_logs or [])
    existing_logs.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "step": 0,
        "total": 10,
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
    await _enqueue_pipeline(str(doc.id))
    return doc
