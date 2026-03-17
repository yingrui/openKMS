"""add_is_default_in_category_to_api_models

Revision ID: l8m9n0o1p2q3
Revises: k7l8m9n0o1p2
Create Date: 2026-03-17

Add is_default_in_category column to api_models.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "l8m9n0o1p2q3"
down_revision: Union[str, Sequence[str], None] = "k7l8m9n0o1p2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "api_models",
        sa.Column("is_default_in_category", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("api_models", "is_default_in_category")
