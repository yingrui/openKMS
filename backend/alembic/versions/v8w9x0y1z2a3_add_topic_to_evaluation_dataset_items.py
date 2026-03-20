"""add topic column to evaluation_dataset_items

Revision ID: v8w9x0y1z2a3
Revises: u7v8w9x0y1z2
Create Date: 2026-03-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "v8w9x0y1z2a3"
down_revision: Union[str, None] = "u7v8w9x0y1z2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "evaluation_dataset_items",
        sa.Column("topic", sa.String(256), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("evaluation_dataset_items", "topic")
