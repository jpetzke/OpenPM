"""document lifecycle: archived_at, replaces_document_id, active index

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-23 13:30:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column(
            "replaces_document_id",
            sa.UUID(as_uuid=False),
            sa.ForeignKey("documents.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_documents_active",
        "documents",
        ["project_id"],
        postgresql_where=sa.text("archived_at IS NULL"),
    )

    # Widen the triggered_by CHECK on state_changelog to allow lifecycle events.
    op.drop_constraint("state_changelog_triggered_by_check", "state_changelog", type_="check")
    op.create_check_constraint(
        "state_changelog_triggered_by_check",
        "state_changelog",
        "triggered_by IN ('pipeline', 'chat_tool', 'manual', 'document_delete', 'document_revert', 'replace')",
    )


def downgrade() -> None:
    op.drop_constraint("state_changelog_triggered_by_check", "state_changelog", type_="check")
    op.create_check_constraint(
        "state_changelog_triggered_by_check",
        "state_changelog",
        "triggered_by IN ('pipeline', 'chat_tool', 'manual')",
    )

    op.drop_index("ix_documents_active", table_name="documents")
    op.drop_column("documents", "replaces_document_id")
    op.drop_column("documents", "archived_at")
