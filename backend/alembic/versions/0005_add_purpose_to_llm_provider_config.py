"""add purpose to llm_provider_config

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("llm_provider_config", sa.Column("purpose", sa.String(), nullable=False, server_default="llm"))

    op.drop_constraint("llm_provider_config_provider_type_check", "llm_provider_config")
    op.create_check_constraint(
        "llm_provider_config_provider_type_check",
        "llm_provider_config",
        "provider_type IN ('openrouter', 'azure_openai', 'openai_compat', 'kreuzberg')",
    )
    op.create_check_constraint(
        "llm_provider_config_purpose_check",
        "llm_provider_config",
        "purpose IN ('llm', 'embedding')",
    )


def downgrade() -> None:
    op.drop_constraint("llm_provider_config_purpose_check", "llm_provider_config")
    op.drop_constraint("llm_provider_config_provider_type_check", "llm_provider_config")
    op.create_check_constraint(
        "llm_provider_config_provider_type_check",
        "llm_provider_config",
        "provider_type IN ('openrouter', 'azure_openai')",
    )
    op.drop_column("llm_provider_config", "purpose")
