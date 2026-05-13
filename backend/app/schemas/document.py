import uuid
from datetime import datetime

from pydantic import BaseModel


class DocumentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    project_id: uuid.UUID
    original_filename: str
    original_path: str
    mime_type: str
    file_size: int
    processing_status: str
    processing_error: str | None
    git_commit_hash: str | None
    uploaded_by: uuid.UUID
    uploaded_at: datetime


class TextDocumentCreate(BaseModel):
    content: str
    title: str
