"""kb agent config

Revision ID: 42186607a45f
Revises: 9b0ed3f69da7
Create Date: 2026-11-11 09:12:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '42186607a45f'
down_revision: Union[str, Sequence[str], None] = '9b0ed3f69da7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Per-KB agent configuration.

    Nullable and empty-by-default: every field in `schemas/kb_agent_config.AgentConfig` defaults to today's behaviour, so an
    existing knowledge base is unchanged. Hand-written because `--autogenerate` on this database also proposes dropping the
    LangGraph checkpoint tables and a set of NOT NULL changes unrelated to this column.
    """
    op.add_column(
        'knowledge_bases',
        sa.Column('agent_config', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('knowledge_bases', 'agent_config')
