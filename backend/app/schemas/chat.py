import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ChatMessageCreate(BaseModel):
    content: str
    model: str | None = None
    session_id: uuid.UUID | None = None


class ChatMessageResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID | None
    role: str
    content: str
    tool_calls: dict | None
    tool_results: dict | None
    state_version: int | None
    model: str | None
    session_id: uuid.UUID | None
    created_at: datetime


class ChatSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    title: str | None
    created_at: datetime
    last_message_at: datetime
    message_count: int
