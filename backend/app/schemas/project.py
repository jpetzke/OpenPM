import uuid
from datetime import datetime

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    client_name: str


class ProjectUpdate(BaseModel):
    name: str | None = None
    client_name: str | None = None
    status: str | None = None


class ProjectResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    client_name: str
    status: str
    compiled_briefing: str | None
    created_at: datetime
    updated_at: datetime
    created_by: uuid.UUID


class ProjectMemberResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    joined_at: datetime


class AddMemberRequest(BaseModel):
    user_id: uuid.UUID
    role: str = "editor"
