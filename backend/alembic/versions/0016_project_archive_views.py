"""project archive + per-user project views

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-29 22:45:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Project soft-archive timestamp + partial index for the active filter.
    op.add_column(
        "projects",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_projects_active",
        "projects",
        ["created_by"],
        postgresql_where=sa.text("archived_at IS NULL"),
    )

    # 2. Per-user last-seen tracking, drives the sidebar unread-changes badge.
    op.create_table(
        "user_project_views",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "project_id", name="user_project_views_unique"),
    )
    op.create_index(
        "user_project_views_user_idx", "user_project_views", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("user_project_views_user_idx", table_name="user_project_views")
    op.drop_table("user_project_views")
    op.drop_index("ix_projects_active", table_name="projects")
    op.drop_column("projects", "archived_at")
