"""Data resources stop carrying a base table.

Revision ID: 8b9c0d1e2f3a
Revises: 7a8b9c0d1e2f
Create Date: 2026-11-06

`data_resources.base_dataset_id` was the anchor a row policy was compiled against. Conditions
now name columns anywhere in the model's relationship graph, and the compiler resolves the
shortest path from **whatever table the query reads** (`entity_scope.compile_entity_scope`), so
the column had no reader left: the API only round-tripped it, and the UI had already dropped the
field. A stale anchor is worse than none — it reads as "this resource is limited to that table",
which is no longer what a resource means.

Downgrade restores the column as nullable but cannot restore values; nothing consumed them.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "8b9c0d1e2f3a"
down_revision: Union[str, Sequence[str], None] = "7a8b9c0d1e2f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("data_resources", "base_dataset_id")


def downgrade() -> None:
    op.add_column(
        "data_resources",
        sa.Column("base_dataset_id", sa.String(length=64), nullable=True),
    )
