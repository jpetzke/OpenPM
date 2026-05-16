import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_project_member
from app.database import get_db
from app.models.project import Project, ProjectMember
from app.models.state import ProjectState, StateChangelog
from app.schemas.state import ProjectStateResponse, StateChangelogResponse, TaskStatusUpdate
from app.services import briefing as briefing_service
from app.services import git_service
from app.services.state_manager import compute_delta

router = APIRouter(prefix="/api/projects/{project_id}/state", tags=["state"])


@router.get("", response_model=ProjectStateResponse)
async def get_current_state(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    result = await db.execute(
        select(ProjectState)
        .where(ProjectState.project_id == project_id)
        .order_by(ProjectState.version.desc())
        .limit(1)
    )
    state = result.scalar_one_or_none()
    if not state:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No state found")
    return state


@router.get("/history", response_model=list[StateChangelogResponse])
async def get_state_history(
    project_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    result = await db.execute(
        select(StateChangelog)
        .where(StateChangelog.project_id == project_id)
        .order_by(StateChangelog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.get("/diff", response_model=dict)
async def get_state_diff(
    project_id: uuid.UUID,
    from_version: int = Query(...),
    to_version: int = Query(...),
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    result_from = await db.execute(
        select(ProjectState).where(
            ProjectState.project_id == project_id, ProjectState.version == from_version
        )
    )
    result_to = await db.execute(
        select(ProjectState).where(
            ProjectState.project_id == project_id, ProjectState.version == to_version
        )
    )
    s_from = result_from.scalar_one_or_none()
    s_to = result_to.scalar_one_or_none()
    if not s_from or not s_to:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    return compute_delta(s_from.state, s_to.state)


@router.get("/{version}", response_model=ProjectStateResponse)
async def get_state_at_version(
    project_id: uuid.UUID,
    version: int,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    result = await db.execute(
        select(ProjectState).where(
            ProjectState.project_id == project_id, ProjectState.version == version
        )
    )
    state = result.scalar_one_or_none()
    if not state:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="State version not found")
    return state


@router.patch("/tasks/{task_id}", response_model=ProjectStateResponse)
async def update_task_status(
    project_id: uuid.UUID,
    task_id: str,
    payload: TaskStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
):
    from sqlalchemy import text

    result = await db.execute(
        select(ProjectState)
        .where(ProjectState.project_id == project_id)
        .order_by(ProjectState.version.desc())
        .limit(1)
        .with_for_update()
    )
    current = result.scalar_one_or_none()
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No state found")

    new_state_data = dict(current.state)
    tasks = new_state_data.get("core", {}).get("open_tasks", [])
    task_found = False
    for task in tasks:
        if task.get("id") == task_id:
            task["status"] = payload.status
            task_found = True
            break
    if not task_found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    new_version = current.version + 1
    new_state_obj = ProjectState(
        project_id=project_id,
        version=new_version,
        state=new_state_data,
    )
    db.add(new_state_obj)

    delta = compute_delta(current.state, new_state_data)
    changelog = StateChangelog(
        project_id=project_id,
        from_version=current.version,
        to_version=new_version,
        delta=delta,
        triggered_by="chat_tool",
    )
    db.add(changelog)
    await db.commit()
    await db.refresh(new_state_obj)

    commit_msg = f"chat_tool: task {task_id} set to {payload.status}"
    commit_hash = git_service.commit_state(str(project_id), new_state_data, commit_msg)
    changelog.git_commit_hash = commit_hash
    await db.commit()

    result_proj = await db.execute(select(Project).where(Project.id == project_id))
    project = result_proj.scalar_one_or_none()

    recent_changelog_result = await db.execute(
        select(StateChangelog)
        .where(StateChangelog.project_id == project_id)
        .order_by(StateChangelog.created_at.desc())
        .limit(3)
    )
    recent_changelog = recent_changelog_result.scalars().all()
    changelog_dicts = [{"to_version": c.to_version, "triggered_by": c.triggered_by} for c in recent_changelog]

    if project:
        briefing_text = briefing_service.render_briefing(
            {"name": project.name, "client_name": project.client_name, "status": project.status, "updated_at": project.updated_at.isoformat()},
            new_state_data,
            new_version,
            changelog_dicts,
        )
        project.compiled_briefing = briefing_text
        await db.commit()

    return new_state_obj
