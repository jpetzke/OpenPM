from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LLMProviderConfig(Base):
    __tablename__ = "llm_provider_config"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    provider_type: Mapped[str] = mapped_column(String, nullable=False)  # "openrouter" | "azure_openai"
    credentials_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    model_assignments: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    purpose: Mapped[str] = mapped_column(String, nullable=False, server_default="llm")  # "llm" | "embedding"
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
