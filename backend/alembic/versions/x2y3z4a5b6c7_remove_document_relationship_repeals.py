"""remove document_relationships repeals edges

Revision ID: x2y3z4a5b6c7
Revises: q1r2s3t4u5v6
Create Date: 2026-04-14

The `repeals` relation type was removed from the API; delete existing rows so
no orphaned `relation_type` values remain.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "x2y3z4a5b6c7"
down_revision: Union[str, None] = "q1r2s3t4u5v6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM document_relationships WHERE relation_type = 'repeals'")


def downgrade() -> None:
    # Cannot restore deleted edges
    pass
