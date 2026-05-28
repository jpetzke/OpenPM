"""Add token usage tracking and monthly budget columns.

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # chat_messages: token_usage JSONB
    op.add_column(
        "chat_messages",
        sa.Column("token_usage", JSONB(), nullable=True),
    )

    # documents: extraction_token_usage JSONB
    op.add_column(
        "documents",
        sa.Column("extraction_token_usage", JSONB(), nullable=True),
    )

    # projects: monthly_budget_usd NUMERIC(10,4)
    op.add_column(
        "projects",
        sa.Column("monthly_budget_usd", sa.Numeric(10, 4), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "monthly_budget_usd")
    op.drop_column("documents", "extraction_token_usage")
    op.drop_column("chat_messages", "token_usage")
