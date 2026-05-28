"""Add briefing metadata columns to projects table.

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("briefing_priority_order", JSONB(), nullable=True))
    op.add_column("projects", sa.Column("briefing_token_count", sa.Integer(), nullable=True))
    op.add_column(
        "projects",
        sa.Column("briefing_was_truncated", sa.Boolean(), nullable=True, server_default="false"),
    )
    op.add_column("projects", sa.Column("briefing_state_version", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "briefing_state_version")
    op.drop_column("projects", "briefing_was_truncated")
    op.drop_column("projects", "briefing_token_count")
    op.drop_column("projects", "briefing_priority_order")
