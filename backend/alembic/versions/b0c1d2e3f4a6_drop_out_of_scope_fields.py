"""Drop out-of-scope semantic-model fields.

A field must reference a dataset in its model's scope; narrowing a model's dataset
scope used to leave the removed datasets' fields behind (shown as raw ids).

Revision ID: b0c1d2e3f4a6
Revises: f9a0b1c2d3e4
Create Date: 2026-06-08
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "b0c1d2e3f4a6"
down_revision: Union[str, Sequence[str], None] = "f9a0b1c2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM semantic_model_fields f
        WHERE NOT EXISTS (
          SELECT 1 FROM semantic_model_datasets m
          WHERE m.semantic_model_id = f.semantic_model_id AND m.dataset_id = f.dataset_id
        )
        """
    )


def downgrade() -> None:
    pass
