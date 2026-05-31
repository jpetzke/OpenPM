import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    client_name: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    client_name: str | None = None
    status: str | None = None
    custom_instructions: str | None = None
    monthly_budget_usd: Decimal | None = None


class ProjectMemberOut(BaseModel):
    id: str
    name: str | None = None
    email: str


class StaleNoticeOut(BaseModel):
    is_stale: bool = True
    days_since_activity: int | None = None
    overdue_deadline_count: int = 0
    dismissed: bool = False
    text_de: str = ""
    text_en: str = ""


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
    custom_instructions: str | None = None
    monthly_budget_usd: Optional[Decimal] = None
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    created_by: uuid.UUID
    document_count: int = 0
    open_task_count: int | None = None
    failed_document_count: int = 0
    unread_change_count: int = 0
    last_activity_at: datetime | None = None
    stale_marker: bool = False
    stale_notice: "StaleNoticeOut | None" = None
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
