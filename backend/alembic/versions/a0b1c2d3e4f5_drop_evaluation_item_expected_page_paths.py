"""drop evaluation_dataset_items.expected_page_paths

Revision ID: a0b1c2d3e4f5
Revises: z9a8b7c6d5e4
Create Date: 2026-05-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a0b1c2d3e4f5"
down_revision: Union[str, None] = "z9a8b7c6d5e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("evaluation_dataset_items", "expected_page_paths")


def downgrade() -> None:
    op.add_column(
        "evaluation_dataset_items",
        sa.Column("expected_page_paths", sa.Text(), nullable=True),
    )
