"""add_description_to_glossary_terms

Revision ID: m9n0o1p2q3r4
Revises: l8m9n0o1p2q3
Create Date: 2026-03-17

Add description column to glossary_terms.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "m9n0o1p2q3r4"
down_revision: Union[str, Sequence[str], None] = "l8m9n0o1p2q3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "glossary_terms",
        sa.Column("description", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("glossary_terms", "description")
