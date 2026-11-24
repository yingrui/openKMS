"""explorations: tighten the timestamps the create_table left nullable

`ex1explorations` created `explorations.created_at` / `explorations.updated_at` / `exploration_layouts.updated_at`
without `nullable=False`, while the models declare `Mapped[datetime]` — so every autogenerate run since then proposes
three NOT NULL alterations nobody asked for. The class is the same one `5ea40717a131` reconciled for 33 columns; those
two tables did not exist yet.

Checked before tightening: 5 rows in `explorations`, 1 in `exploration_layouts`, zero NULLs in all three columns.

The migration is already pushed, so it is not rewritten — this is the patch.

Revision ID: b372f5321237
Revises: f1f6d9ef103d
Create Date: 2026-11-23 16:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b372f5321237"
down_revision: Union[str, Sequence[str], None] = "f1f6d9ef103d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table, column in (
        ("explorations", "created_at"),
        ("explorations", "updated_at"),
        ("exploration_layouts", "updated_at"),
    ):
        op.alter_column(
            table,
            column,
            existing_type=sa.DateTime(timezone=True),
            nullable=False,
            existing_server_default=sa.text("now()"),
        )


def downgrade() -> None:
    for table, column in (
        ("explorations", "created_at"),
        ("explorations", "updated_at"),
        ("exploration_layouts", "updated_at"),
    ):
        op.alter_column(
            table,
            column,
            existing_type=sa.DateTime(timezone=True),
            nullable=True,
            existing_server_default=sa.text("now()"),
        )
