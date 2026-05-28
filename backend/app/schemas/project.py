import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    client_name: str


class ProjectUpdate(BaseModel):
    name: str | None = None
    client_name: str | None = None
    status: str | None = None
    monthly_budget_usd: Decimal | None = None


class ProjectMemberOut(BaseModel):
    id: str
    name: str | None = None
    email: str


class ProjectResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    client_name: str
    status: str
    compiled_briefing: str | None
    briefing_token_count: Optional[int] = None
    briefing_was_truncated: Optional[bool] = None
    briefing_state_version: Optional[int] = None
    briefing_priority_order: Optional[list[str]] = None
    monthly_budget_usd: Optional[Decimal] = None
    created_at: datetime
    updated_at: datetime
    created_by: uuid.UUID
    document_count: int = 0
    open_task_count: int | None = None
    members: list[ProjectMemberOut] = []


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
