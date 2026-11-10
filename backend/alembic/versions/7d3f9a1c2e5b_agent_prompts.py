"""agent prompts: versioned text with a publish gate

Revision ID: 7d3f9a1c2e5b
Revises: 5c2e8f1a9b04
Create Date: 2026-11-11 11:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '7d3f9a1c2e5b'
down_revision: Union[str, Sequence[str], None] = '5c2e8f1a9b04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'agent_prompts',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('knowledge_base_id', sa.String(length=64), nullable=False),
        sa.Column('key', sa.String(length=64), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('gated_by_run_id', sa.String(length=64), nullable=True),
        sa.Column('created_by', sa.String(length=512), nullable=True),
        sa.Column('created_by_name', sa.String(length=256), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['knowledge_base_id'], ['knowledge_bases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_agent_prompts_kb', 'agent_prompts', ['knowledge_base_id', 'key', 'version'], unique=False)
    # One live prompt per (kb, key): two published versions is the state nobody can explain.
    op.create_index(
        'uq_agent_prompts_one_published',
        'agent_prompts',
        ['knowledge_base_id', 'key'],
        unique=True,
        postgresql_where=sa.text("status = 'published'"),
    )
    # Version numbers must not collide, so a concurrent draft cannot take the same number.
    op.create_index(
        'uq_agent_prompts_version',
        'agent_prompts',
        ['knowledge_base_id', 'key', 'version'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index('uq_agent_prompts_version', table_name='agent_prompts')
    op.drop_index('uq_agent_prompts_one_published', table_name='agent_prompts')
    op.drop_index('ix_agent_prompts_kb', table_name='agent_prompts')
    op.drop_table('agent_prompts')
