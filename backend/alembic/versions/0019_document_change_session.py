"""persist change_session_id on documents for bulk-upload grouping

Revision ID: 0019
Revises: 0018
Create Date: 2026-05-30 09:05:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column(
            "change_session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("change_sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "documents_change_session_idx", "documents", ["change_session_id"]
    )


def downgrade() -> None:
    op.drop_index("documents_change_session_idx", table_name="documents")
    op.drop_column("documents", "change_session_id")
