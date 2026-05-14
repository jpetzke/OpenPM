"""document observability and dynamic state

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("summary", sa.Text(), nullable=True))
    op.add_column("documents", sa.Column("pipeline_logs", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("documents", sa.Column("pipeline_step", sa.Integer(), nullable=True))
    op.add_column("documents", sa.Column("pipeline_step_label", sa.String(), nullable=True))
    op.add_column("documents", sa.Column("pipeline_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "pipeline_updated_at")
    op.drop_column("documents", "pipeline_step_label")
    op.drop_column("documents", "pipeline_step")
    op.drop_column("documents", "pipeline_logs")
    op.drop_column("documents", "summary")
