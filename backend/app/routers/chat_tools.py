from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class _StrictModel(BaseModel):
    model_config = {"extra": "forbid"}


class ListDocumentsArgs(_StrictModel):
    pass


class GetCurrentStateArgs(_StrictModel):
    pass


class GetStateHistoryArgs(_StrictModel):
    limit: int | None = Field(default=None, ge=1, le=50)


class SearchDocumentsArgs(_StrictModel):
    query: str = Field(min_length=1)
    limit: int | None = Field(default=None, ge=1, le=10)


class GetDocumentContentArgs(_StrictModel):
    document_id: str = Field(min_length=1)


class UpdateTaskStatusArgs(_StrictModel):
    task_id: str = Field(min_length=1)
    status: Literal["open", "done", "blocked"]


TOOL_ARG_MODELS: dict[str, type[BaseModel]] = {
    "list_documents": ListDocumentsArgs,
    "get_current_state": GetCurrentStateArgs,
    "get_state_history": GetStateHistoryArgs,
    "search_documents": SearchDocumentsArgs,
    "get_document_content": GetDocumentContentArgs,
    "update_task_status": UpdateTaskStatusArgs,
}
