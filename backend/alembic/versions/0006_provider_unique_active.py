"""one active provider per purpose

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-20 00:00:00.000000

"""
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Deactivate older duplicates so the partial unique index can be created.
    op.execute(
        """
        WITH ranked AS (
            SELECT id, purpose, is_active,
                   ROW_NUMBER() OVER (PARTITION BY purpose ORDER BY updated_at DESC, created_at DESC) AS rn
            FROM llm_provider_config
            WHERE is_active = true
        )
        UPDATE llm_provider_config p
           SET is_active = false
          FROM ranked r
         WHERE p.id = r.id
           AND r.rn > 1;
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_active_provider_per_purpose "
        "ON llm_provider_config (purpose) WHERE is_active;"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_active_provider_per_purpose;")
