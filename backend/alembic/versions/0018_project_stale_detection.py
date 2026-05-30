"""project stale detection: last_activity_at + stale_marker + per-user dismissal

Revision ID: 0018
Revises: 0017
Create Date: 2026-05-30 08:40:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Project activity tracking — bumped on every upload / chat message; the
    # daily stale cron flips stale_marker when it exceeds the idle window.
    op.add_column(
        "projects",
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column(
            "stale_marker",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # Backfill: treat the last update as the last known activity so existing
    # projects don't all light up stale on the first cron run.
    op.execute("UPDATE projects SET last_activity_at = updated_at WHERE last_activity_at IS NULL")

    # Per-user dismissal of the stale banner (lives alongside last_seen_at).
    op.add_column(
        "user_project_views",
        sa.Column("stale_dismissed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_project_views", "stale_dismissed_at")
    op.drop_column("projects", "stale_marker")
    op.drop_column("projects", "last_activity_at")
