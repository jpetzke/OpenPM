import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        # Valid processing_status values:
        #   pending           — queued, not yet started
        #   processing        — pipeline running
        #   done              — fully completed
        #   failed            — pipeline terminated with error
        #   cancelled         — user-cancelled mid-run
        #   completed_partial — pipeline finished but embedding step failed;
        #                       state IS merged, full-text search is limited
        CheckConstraint(
            "processing_status IN ('pending', 'processing', 'done', 'failed', 'cancelled', 'completed_partial')",
            name="documents_processing_status_check",
        ),
        Index("documents_project_idx", "project_id"),
        Index("documents_status_idx", "processing_status"),
        Index("documents_uploaded_at_idx", "uploaded_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    original_path: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    raw_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    doc_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    pipeline_logs: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)
    pipeline_step: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pipeline_step_label: Mapped[str | None] = mapped_column(String, nullable=True)
    pipeline_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    processing_status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    processing_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_class: Mapped[str | None] = mapped_column(String(64), nullable=True)
    git_commit_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    arq_job_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replaces_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    extraction_token_usage: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    source_format: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    parent_document_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
    )
    change_session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("change_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Self-referential relationships for EML attachment grouping
    parent: Mapped[Optional["Document"]] = relationship(
        "Document",
        foreign_keys=[parent_document_id],
        back_populates="children",
        remote_side="Document.id",
    )
    children: Mapped[List["Document"]] = relationship(
        "Document",
        foreign_keys=[parent_document_id],
        back_populates="parent",
    )
