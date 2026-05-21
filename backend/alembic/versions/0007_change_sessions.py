"""change sessions for grouped changelog

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-21 21:50:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "change_sessions",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("triggered_by", sa.String(), nullable=True),
        sa.CheckConstraint(
            "triggered_by IS NULL OR triggered_by IN ('auto_idle', 'manual_close', 'system')",
            name="change_sessions_triggered_by_check",
        ),
    )
    op.create_index("change_sessions_project_idx", "change_sessions", ["project_id"])
    op.create_index("change_sessions_open_idx", "change_sessions", ["project_id", "closed_at"])

    op.add_column(
        "state_changelog",
        sa.Column(
            "change_session_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("change_sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("state_changelog_change_session_idx", "state_changelog", ["change_session_id"])


def downgrade() -> None:
    op.drop_index("state_changelog_change_session_idx", table_name="state_changelog")
    op.drop_column("state_changelog", "change_session_id")
    op.drop_index("change_sessions_open_idx", table_name="change_sessions")
    op.drop_index("change_sessions_project_idx", table_name="change_sessions")
    op.drop_table("change_sessions")
