"""Section U: export endpoints — briefing.md and full ZIP snapshot.

Chat-session markdown export lives in the chat router (path is under
/chat/sessions/{sid}). Everything here is synchronous + zero-LLM. The ZIP is
assembled in memory; an ARQ-backed async path for very large (>100 MB)
projects is deferred (see roadmap U) — the status endpoint reports readiness
synchronously so the frontend contract is stable if async lands later.
"""

import uuid

from fastapi import APIRouter, Depends, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_project_member
from app.database import get_db
from app.models.document import Document
from app.models.project import ProjectMember
from app.routers.projects import _get_project_or_404
from app.services import export_service

router = APIRouter(prefix="/api/projects/{project_id}", tags=["export"])


@router.get("/export/briefing.md")
async def export_briefing_md(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    project = await _get_project_or_404(project_id, db)
    md = await export_service.briefing_markdown(project)
    return PlainTextResponse(
        md,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="briefing.md"'},
    )


@router.get("/export.zip/status")
async def export_zip_status(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    await _get_project_or_404(project_id, db)
    doc_count = await db.scalar(
        select(func.count(Document.id)).where(
            Document.project_id == project_id, Document.archived_at.is_(None)
        )
    ) or 0
    total_bytes = await db.scalar(
        select(func.coalesce(func.sum(Document.file_size), 0)).where(
            Document.project_id == project_id, Document.archived_at.is_(None)
        )
    ) or 0
    return {
        "ready": True,
        "mode": "sync",
        "document_count": int(doc_count),
        "documents_total_bytes": int(total_bytes),
    }


@router.get("/export.zip")
async def export_zip(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    project = await _get_project_or_404(project_id, db)
    data = await export_service.build_zip(project, db)
    filename = export_service.zip_filename(project)
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
