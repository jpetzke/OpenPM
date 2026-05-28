"""document formats — source_format + parent_document_id

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-28 21:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add source_format column
    op.add_column(
        "documents",
        sa.Column("source_format", sa.String(32), nullable=True),
    )

    # 2. Add parent_document_id (self-referential FK)
    op.add_column(
        "documents",
        sa.Column(
            "parent_document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # 3. Backfill source_format from existing mime_type / filename extension
    op.execute(
        """
        UPDATE documents
        SET source_format = CASE
            WHEN mime_type LIKE 'image/%'                         THEN 'image'
            WHEN mime_type LIKE 'audio/%'                         THEN 'audio'
            WHEN mime_type = 'message/rfc822'                     THEN 'eml'
            WHEN mime_type = 'application/pdf'                    THEN 'pdf'
            WHEN mime_type IN (
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/msword'
            )                                                     THEN 'docx'
            WHEN mime_type IN (
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-excel',
                'text/csv'
            )                                                     THEN 'spreadsheet'
            WHEN mime_type IN ('text/plain', 'text/markdown')     THEN 'txt'
            WHEN mime_type = 'text/html'                          THEN 'html'
            WHEN mime_type = 'application/json'                   THEN 'json'
            WHEN mime_type = 'application/rtf'                    THEN 'rtf'
            WHEN original_filename LIKE '%.eml'                   THEN 'eml'
            WHEN original_filename LIKE '%.png'
              OR original_filename LIKE '%.jpg'
              OR original_filename LIKE '%.jpeg'
              OR original_filename LIKE '%.webp'                  THEN 'image'
            WHEN original_filename LIKE '%.mp3'
              OR original_filename LIKE '%.m4a'
              OR original_filename LIKE '%.wav'
              OR original_filename LIKE '%.ogg'                   THEN 'audio'
            WHEN original_filename LIKE '%.md'
              OR original_filename LIKE '%.markdown'              THEN 'md'
            WHEN original_filename LIKE '%.csv'                   THEN 'csv'
            WHEN original_filename LIKE '%.xlsx'
              OR original_filename LIKE '%.xls'                   THEN 'spreadsheet'
            WHEN original_filename LIKE '%.pdf'                   THEN 'pdf'
            WHEN original_filename LIKE '%.docx'
              OR original_filename LIKE '%.doc'                   THEN 'docx'
            WHEN original_filename LIKE '%.rtf'                   THEN 'rtf'
            WHEN original_filename LIKE '%.html'
              OR original_filename LIKE '%.htm'                   THEN 'html'
            WHEN original_filename LIKE '%.json'                  THEN 'json'
            WHEN original_filename LIKE '%.log'                   THEN 'log'
            ELSE 'other'
        END
        WHERE source_format IS NULL
        """
    )

    # 4. Index for FK lookups (children of a parent)
    op.create_index("documents_parent_doc_idx", "documents", ["parent_document_id"])


def downgrade() -> None:
    op.drop_index("documents_parent_doc_idx", table_name="documents")
    op.drop_column("documents", "parent_document_id")
    op.drop_column("documents", "source_format")
