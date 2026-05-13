"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.UniqueConstraint('email', name='users_email_key'),
    )

    op.create_table(
        'projects',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('client_name', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='active'),
        sa.Column('compiled_briefing', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.CheckConstraint("status IN ('active', 'paused', 'completed', 'archived')", name='projects_status_check'),
    )
    op.create_index('projects_created_by_idx', 'projects', ['created_by'])
    op.create_index('projects_status_idx', 'projects', ['status'])

    op.create_table(
        'project_members',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(), nullable=False, server_default='editor'),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("role IN ('owner', 'editor', 'viewer')", name='project_members_role_check'),
        sa.UniqueConstraint('project_id', 'user_id', name='project_members_project_id_user_id_key'),
    )
    op.create_index('project_members_project_idx', 'project_members', ['project_id'])
    op.create_index('project_members_user_idx', 'project_members', ['user_id'])

    op.create_table(
        'documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('original_filename', sa.String(), nullable=False),
        sa.Column('original_path', sa.String(), nullable=False),
        sa.Column('mime_type', sa.String(), nullable=False),
        sa.Column('file_size', sa.BigInteger(), nullable=False),
        sa.Column('raw_content', sa.Text(), nullable=True),
        sa.Column('metadata', postgresql.JSONB(), nullable=True),
        sa.Column('processing_status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('processing_error', sa.Text(), nullable=True),
        sa.Column('git_commit_hash', sa.String(), nullable=True),
        sa.Column('uploaded_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint(
            "processing_status IN ('pending', 'processing', 'done', 'failed')",
            name='documents_processing_status_check',
        ),
    )
    op.create_index('documents_project_idx', 'documents', ['project_id'])
    op.create_index('documents_status_idx', 'documents', ['processing_status'])
    op.create_index('documents_uploaded_at_idx', 'documents', ['uploaded_at'])

    op.create_table(
        'project_state',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('state', postgresql.JSONB(), nullable=False),
        sa.Column('triggered_by_document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.UniqueConstraint('project_id', 'version', name='project_state_version_unique'),
    )
    op.create_index('project_state_project_version_idx', 'project_state', ['project_id', 'version'])
    op.create_index('project_state_gin_idx', 'project_state', ['state'], postgresql_using='gin')

    op.create_table(
        'state_changelog',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('from_version', sa.Integer(), nullable=True),
        sa.Column('to_version', sa.Integer(), nullable=False),
        sa.Column('delta', postgresql.JSONB(), nullable=False),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='SET NULL'), nullable=True),
        sa.Column('triggered_by', sa.String(), nullable=False, server_default='pipeline'),
        sa.Column('git_commit_hash', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("triggered_by IN ('pipeline', 'chat_tool', 'manual')", name='state_changelog_triggered_by_check'),
    )
    op.create_index('state_changelog_project_idx', 'state_changelog', ['project_id'])
    op.create_index('state_changelog_created_at_idx', 'state_changelog', ['project_id', 'created_at'])

    op.create_table(
        'chat_messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('tool_calls', postgresql.JSONB(), nullable=True),
        sa.Column('tool_results', postgresql.JSONB(), nullable=True),
        sa.Column('state_version', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("role IN ('user', 'assistant', 'tool')", name='chat_messages_role_check'),
    )
    op.create_index('chat_messages_project_idx', 'chat_messages', ['project_id'])
    op.create_index('chat_messages_created_at_idx', 'chat_messages', ['project_id', 'created_at'])


def downgrade() -> None:
    op.drop_table('chat_messages')
    op.drop_table('state_changelog')
    op.drop_table('project_state')
    op.drop_table('documents')
    op.drop_table('project_members')
    op.drop_table('projects')
    op.drop_table('users')
