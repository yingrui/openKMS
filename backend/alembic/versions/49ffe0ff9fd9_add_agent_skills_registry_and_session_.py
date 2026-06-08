"""add agent skills registry and session api key purpose

Revision ID: 49ffe0ff9fd9
Revises: u0v1w2x3y4z5
Create Date: 2026-06-08 16:37:06.490586

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '49ffe0ff9fd9'
down_revision: Union[str, Sequence[str], None] = 'v1w2x3y4z5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'agent_skills',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('display_name', sa.String(length=256), nullable=False),
        sa.Column('created_by', sa.String(length=512), nullable=True),
        sa.Column('created_by_name', sa.String(length=256), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('default_version', sa.String(length=128), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_agent_skills_created_by'), 'agent_skills', ['created_by'], unique=False)
    op.create_table(
        'agent_skill_versions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('skill_id', sa.String(length=64), nullable=False),
        sa.Column('version', sa.String(length=128), nullable=False),
        sa.Column('uploaded_by', sa.String(length=512), nullable=True),
        sa.Column('uploaded_by_name', sa.String(length=256), nullable=True),
        sa.Column('content_hash', sa.String(length=64), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['skill_id'], ['agent_skills.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('skill_id', 'version', name='uq_agent_skill_versions_skill_version'),
    )
    op.create_index(op.f('ix_agent_skill_versions_skill_id'), 'agent_skill_versions', ['skill_id'], unique=False)
    op.create_index(op.f('ix_agent_skill_versions_uploaded_by'), 'agent_skill_versions', ['uploaded_by'], unique=False)
    op.add_column(
        'user_api_keys',
        sa.Column('purpose', sa.String(length=32), nullable=False, server_default='personal'),
    )
    op.add_column('user_api_keys', sa.Column('agent_conversation_id', sa.String(length=64), nullable=True))
    op.create_index(op.f('ix_user_api_keys_agent_conversation_id'), 'user_api_keys', ['agent_conversation_id'], unique=False)
    op.create_index(op.f('ix_user_api_keys_purpose'), 'user_api_keys', ['purpose'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_user_api_keys_purpose'), table_name='user_api_keys')
    op.drop_index(op.f('ix_user_api_keys_agent_conversation_id'), table_name='user_api_keys')
    op.drop_column('user_api_keys', 'agent_conversation_id')
    op.drop_column('user_api_keys', 'purpose')
    op.drop_index(op.f('ix_agent_skill_versions_uploaded_by'), table_name='agent_skill_versions')
    op.drop_index(op.f('ix_agent_skill_versions_skill_id'), table_name='agent_skill_versions')
    op.drop_table('agent_skill_versions')
    op.drop_index(op.f('ix_agent_skills_created_by'), table_name='agent_skills')
    op.drop_table('agent_skills')
