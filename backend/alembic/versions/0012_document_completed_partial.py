"""Add completed_partial to documents processing_status constraint.

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-23
"""
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_processing_status_check")
    op.execute(
        "ALTER TABLE documents ADD CONSTRAINT documents_processing_status_check "
        "CHECK (processing_status IN ('pending', 'processing', 'done', 'failed', 'cancelled', 'completed_partial'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_processing_status_check")
    op.execute(
        "ALTER TABLE documents ADD CONSTRAINT documents_processing_status_check "
        "CHECK (processing_status IN ('pending', 'processing', 'done', 'failed', 'cancelled'))"
    )
