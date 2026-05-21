import uuid
from datetime import datetime

from pydantic import BaseModel


class ProjectStateResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    project_id: uuid.UUID
    version: int
    state: dict
    triggered_by_document_id: uuid.UUID | None
    created_at: datetime


class StateChangelogResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    project_id: uuid.UUID
    from_version: int | None
    to_version: int
    delta: dict
    document_id: uuid.UUID | None
    triggered_by: str
    change_session_id: uuid.UUID | None = None
    git_commit_hash: str | None
    created_at: datetime


class ChangeSessionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    project_id: uuid.UUID
    started_at: datetime
    last_activity_at: datetime
    closed_at: datetime | None
    summary: dict | None
    triggered_by: str | None


class TaskStatusUpdate(BaseModel):
    status: str  # 'open' | 'done' | 'blocked'
