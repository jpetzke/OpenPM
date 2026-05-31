"""add custom_instructions text field to projects

Revision ID: 0020
Revises: 0019
Create Date: 2026-05-31 08:40:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("custom_instructions", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "custom_instructions")
