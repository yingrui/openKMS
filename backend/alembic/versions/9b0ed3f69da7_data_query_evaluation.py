"""data_query evaluation

Revision ID: 9b0ed3f69da7
Revises: 4a8129717c58
Create Date: 2026-11-09 23:12:07.533976

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '9b0ed3f69da7'
down_revision: Union[str, Sequence[str], None] = '4a8129717c58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """A data-query evaluation judges a semantic model's answers, not a KB's.

    Hand-written: ``--autogenerate`` on this database also proposes dropping the LangGraph
    ``checkpoint*`` tables, several indexes and NOT NULL changes (the metadata has drifted),
    which has nothing to do with this change.
    """
    op.add_column(
        'evaluation_items',
        sa.Column('expected_query', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column('evaluations', sa.Column('semantic_model_id', sa.String(length=64), nullable=True))
    op.add_column('evaluations', sa.Column('data_resource_id', sa.String(length=64), nullable=True))
    op.create_index(op.f('ix_evaluations_semantic_model_id'), 'evaluations', ['semantic_model_id'], unique=False)
    op.create_foreign_key(
        'fk_evaluations_semantic_model_id', 'evaluations', 'semantic_models',
        ['semantic_model_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_evaluations_semantic_model_id', 'evaluations', type_='foreignkey')
    op.drop_index(op.f('ix_evaluations_semantic_model_id'), table_name='evaluations')
    op.drop_column('evaluations', 'data_resource_id')
    op.drop_column('evaluations', 'semantic_model_id')
    op.drop_column('evaluation_items', 'expected_query')
