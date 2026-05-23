"""document cancel, dedup, retry columns

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-22 12:00:00.000000

Adds columns needed for pipeline cancel, content-hash dedup, and retry tracking:
- arq_job_id    — current ARQ job id (used as cancel-key)
- content_hash  — sha256 of uploaded bytes (per-project dedup)
- retry_count   — how many times the doc has been retried
- error_class   — short error class for failed runs

Also widens the processing_status check constraint to allow 'cancelled'
and adds a partial index for fast (project_id, content_hash) lookups.

"""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("arq_job_id", sa.String(length=64), nullable=True))
    op.add_column("documents", sa.Column("content_hash", sa.CHAR(length=64), nullable=True))
    op.add_column(
        "documents",
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("documents", sa.Column("error_class", sa.String(length=64), nullable=True))

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_documents_project_hash "
        "ON documents(project_id, content_hash) WHERE content_hash IS NOT NULL"
    )

    # Replace the processing_status CHECK constraint to allow 'cancelled'.
    op.execute("ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_processing_status_check")
    op.execute(
        "ALTER TABLE documents ADD CONSTRAINT documents_processing_status_check "
        "CHECK (processing_status IN ('pending', 'processing', 'done', 'failed', 'cancelled'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_processing_status_check")
    op.execute(
        "ALTER TABLE documents ADD CONSTRAINT documents_processing_status_check "
        "CHECK (processing_status IN ('pending', 'processing', 'done', 'failed'))"
    )
    op.execute("DROP INDEX IF EXISTS ix_documents_project_hash")
    op.drop_column("documents", "error_class")
    op.drop_column("documents", "retry_count")
    op.drop_column("documents", "content_hash")
    op.drop_column("documents", "arq_job_id")
