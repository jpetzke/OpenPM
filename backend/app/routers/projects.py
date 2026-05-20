import shutil
import uuid
from pathlib import Path

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_project_member, require_role
from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.models.project import Project, ProjectMember
from app.models.state import ProjectState
from app.models.user import User
from app.schemas.project import (
    AddMemberRequest,
    ProjectCreate,
    ProjectMemberOut,
    ProjectMemberResponse,
    ProjectResponse,
    ProjectUpdate,
)
from app.services import git_service, qdrant_service

log = structlog.get_logger()

router = APIRouter(prefix="/api/projects", tags=["projects"])


async def _get_project_or_404(project_id: uuid.UUID, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _project_response(
    project: Project,
    *,
    document_count: int = 0,
    open_task_count: int | None = None,
    members: list[ProjectMemberOut] | None = None,
) -> ProjectResponse:
    return ProjectResponse(
        id=project.id,
        name=project.name,
        client_name=project.client_name,
        status=project.status,
        compiled_briefing=project.compiled_briefing,
        created_at=project.created_at,
        updated_at=project.updated_at,
        created_by=project.created_by,
        document_count=document_count,
        open_task_count=open_task_count,
        members=members or [],
    )


async def _enrich_single_project(project: Project, db: AsyncSession) -> ProjectResponse:
    doc_count = await db.scalar(
        select(func.count(Document.id)).where(Document.project_id == project.id)
    ) or 0

    latest_state_row = await db.execute(
        select(ProjectState.state)
        .where(ProjectState.project_id == project.id)
        .order_by(ProjectState.version.desc())
        .limit(1)
    )
    latest_state = latest_state_row.scalar_one_or_none()
    open_task_count: int | None = None
    if latest_state is not None:
        open_task_count = len((latest_state.get("core") or {}).get("open_tasks") or [])

    member_rows = (
        await db.execute(
            select(User.id, User.name, User.email)
            .join(ProjectMember, ProjectMember.user_id == User.id)
            .where(ProjectMember.project_id == project.id)
        )
    ).all()
    members = [ProjectMemberOut(id=str(uid), name=name, email=email) for uid, name, email in member_rows]

    return _project_response(
        project,
        document_count=doc_count,
        open_task_count=open_task_count,
        members=members,
    )


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == current_user.id)
    )
    projects = result.scalars().all()
    if not projects:
        return []

    project_ids = [p.id for p in projects]

    doc_counts_rows = (
        await db.execute(
            select(Document.project_id, func.count(Document.id))
            .where(Document.project_id.in_(project_ids))
            .group_by(Document.project_id)
        )
    ).all()
    doc_counts: dict[uuid.UUID, int] = {pid: cnt for pid, cnt in doc_counts_rows}

    # Pull all state rows for these projects, then reduce to the latest version per project.
    state_rows = (
        await db.execute(
            select(ProjectState.project_id, ProjectState.state, ProjectState.version)
            .where(ProjectState.project_id.in_(project_ids))
        )
    ).all()
    latest_states: dict[uuid.UUID, dict] = {}
    latest_versions: dict[uuid.UUID, int] = {}
    for pid, state, version in state_rows:
        if pid not in latest_versions or version > latest_versions[pid]:
            latest_versions[pid] = version
            latest_states[pid] = state
    open_task_counts: dict[uuid.UUID, int] = {
        pid: len((s.get("core") or {}).get("open_tasks") or []) for pid, s in latest_states.items()
    }

    member_rows = (
        await db.execute(
            select(ProjectMember.project_id, User.id, User.name, User.email)
            .join(User, User.id == ProjectMember.user_id)
            .where(ProjectMember.project_id.in_(project_ids))
        )
    ).all()
    members_map: dict[uuid.UUID, list[ProjectMemberOut]] = {}
    for pid, uid, name, email in member_rows:
        members_map.setdefault(pid, []).append(
            ProjectMemberOut(id=str(uid), name=name, email=email)
        )

    return [
        _project_response(
            p,
            document_count=doc_counts.get(p.id, 0),
            open_task_count=open_task_counts.get(p.id),
            members=members_map.get(p.id, []),
        )
        for p in projects
    ]


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = Project(name=payload.name, client_name=payload.client_name, created_by=current_user.id)
    db.add(project)
    await db.flush()
    member = ProjectMember(project_id=project.id, user_id=current_user.id, role="owner")
    db.add(member)
    await db.commit()
    await db.refresh(project)

    try:
        git_service.init_project_repo(str(project.id))
        await qdrant_service.create_collection(str(project.id))
    except Exception as exc:
        log.error(
            "project_setup_failed",
            project_id=str(project.id),
            error=str(exc),
            exc_info=True,
        )
        # Best-effort cleanup: qdrant collection, on-disk repo, then DB row.
        try:
            await qdrant_service.delete_collection(str(project.id))
        except Exception:
            pass
        try:
            project_storage = Path(settings.storage_path) / "projects" / str(project.id)
            if project_storage.exists():
                shutil.rmtree(project_storage, ignore_errors=True)
        except Exception:
            pass
        try:
            await db.delete(project)
            await db.commit()
        except Exception:
            await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="project_setup_failed",
        ) from exc

    return _project_response(
        project,
        document_count=0,
        open_task_count=None,
        members=[
            ProjectMemberOut(
                id=str(current_user.id),
                name=current_user.name,
                email=current_user.email,
            )
        ],
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    project = await _get_project_or_404(project_id, db)
    return await _enrich_single_project(project, db)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    project = await _get_project_or_404(project_id, db)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    return await _enrich_single_project(project, db)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(require_role("owner")),
):
    project = await _get_project_or_404(project_id, db)
    project_storage = Path(settings.storage_path) / "projects" / str(project_id)
    if project_storage.exists():
        shutil.rmtree(project_storage)
    try:
        await qdrant_service.delete_collection(str(project_id))
    except Exception as exc:
        log.error(
            "qdrant_delete_collection_failed",
            project_id=str(project_id),
            error=str(exc),
            exc_info=True,
        )
    await db.delete(project)
    await db.commit()


@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
async def list_members(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    result = await db.execute(select(ProjectMember).where(ProjectMember.project_id == project_id))
    return result.scalars().all()


@router.post("/{project_id}/members", response_model=ProjectMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_member(
    project_id: uuid.UUID,
    payload: AddMemberRequest,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(require_role("owner")),
):
    existing = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == payload.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already a member")
    new_member = ProjectMember(project_id=project_id, user_id=payload.user_id, role=payload.role)
    db.add(new_member)
    await db.commit()
    await db.refresh(new_member)
    return new_member


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(require_role("owner")),
):
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    await db.delete(member)
    await db.commit()


@router.get("/{project_id}/embeddings/status")
async def embeddings_status(
    project_id: uuid.UUID,
    _member: ProjectMember = Depends(get_project_member),
):
    """Report whether the project's Qdrant collection dimension matches the
    currently active embedding provider. Surfaced in the UI so users can
    recover from provider switches that change vector dimensions."""
    return await qdrant_service.collection_status(str(project_id))


@router.post("/{project_id}/embeddings/recreate")
async def embeddings_recreate(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(require_role("owner")),
):
    """Destructively recreate the Qdrant collection at the active embedding
    provider's dimension. Existing vectors are lost; documents must be
    re-uploaded or re-processed afterwards. Owner-only."""
    try:
        result = await qdrant_service.recreate_collection(str(project_id))
    except Exception as exc:
        log.error("embeddings_recreate_failed", project_id=str(project_id), error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"embeddings_recreate_failed: {exc}",
        ) from exc
    log.info("embeddings_recreated", project_id=str(project_id), dim=result.get("collection_dim"))
    return result
