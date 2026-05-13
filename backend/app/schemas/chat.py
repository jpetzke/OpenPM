import uuid
from datetime import datetime

from pydantic import BaseModel


class ChatMessageCreate(BaseModel):
    content: str


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
    created_at: datetime
