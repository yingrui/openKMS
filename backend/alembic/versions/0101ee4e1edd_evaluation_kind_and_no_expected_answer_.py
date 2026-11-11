"""evaluation kind, and no expected answer for a query item

Revision ID: 0101ee4e1edd
Revises: m4n5o6p7q8r9
Create Date: 2026-11-11 17:12:00.000000

What an item holds was never recorded, only chosen per run: the same dataset could be run as retrieval, as QA, or as a
data-query set, and the editor could not know which columns mattered. `kind` makes that a property of the dataset, and
lets a `query` item drop the prose answer it never had — `[correct]` was only there because the column was NOT NULL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0101ee4e1edd'
down_revision: Union[str, Sequence[str], None] = 'm4n5o6p7q8r9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'evaluations',
        sa.Column('kind', sa.String(length=16), nullable=False, server_default='answer'),
    )
    # Backfill before anything reads it: a dataset whose items carry expected queries is a query set, even though
    # nothing recorded that when the rows were written.
    op.execute(
        """
        UPDATE evaluations e SET kind = 'query'
        WHERE EXISTS (SELECT 1 FROM evaluation_items i
                      WHERE i.evaluation_id = e.id AND i.expected_query IS NOT NULL)
        """
    )
    op.execute("UPDATE evaluations SET kind = 'content' WHERE kind = 'answer' AND wiki_space_id IS NOT NULL")
    op.alter_column('evaluation_items', 'expected_answer', existing_type=sa.Text(), nullable=True)


def downgrade() -> None:
    # A query item has no prose answer to restore, so the NOT NULL constraint needs one before it can come back.
    op.execute("UPDATE evaluation_items SET expected_answer = '' WHERE expected_answer IS NULL")
    op.alter_column('evaluation_items', 'expected_answer', existing_type=sa.Text(), nullable=False)
    op.drop_column('evaluations', 'kind')
