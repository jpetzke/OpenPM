"""chat sessions

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-22 08:22:00.000000

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "last_message_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("message_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "idx_chat_sessions_project",
        "chat_sessions",
        ["project_id", "archived_at"],
    )

    op.add_column(
        "chat_messages",
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chat_sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Backfill: create one "Importierter Verlauf" session per project for existing messages.
    op.execute(
        """
        INSERT INTO chat_sessions (project_id, title, created_at, last_message_at, message_count)
        SELECT
            project_id,
            'Importierter Verlauf',
            MIN(created_at),
            MAX(created_at),
            COUNT(*)
        FROM chat_messages
        GROUP BY project_id
        """
    )
    op.execute(
        """
        UPDATE chat_messages cm
        SET session_id = (
            SELECT cs.id
            FROM chat_sessions cs
            WHERE cs.project_id = cm.project_id
            LIMIT 1
        )
        """
    )


def downgrade() -> None:
    op.drop_column("chat_messages", "session_id")
    op.drop_index("idx_chat_sessions_project", table_name="chat_sessions")
    op.drop_table("chat_sessions")
