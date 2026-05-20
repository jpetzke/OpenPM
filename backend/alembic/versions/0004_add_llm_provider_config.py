"""add llm_provider_config table

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "llm_provider_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("provider_type", sa.String(), nullable=False),
        sa.Column("credentials_encrypted", sa.Text(), nullable=False),
        sa.Column("model_assignments", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "provider_type IN ('openrouter', 'azure_openai')",
            name="llm_provider_config_provider_type_check",
        ),
    )
    op.create_index("llm_provider_config_is_active_idx", "llm_provider_config", ["is_active"])


def downgrade() -> None:
    op.drop_index("llm_provider_config_is_active_idx", table_name="llm_provider_config")
    op.drop_table("llm_provider_config")
