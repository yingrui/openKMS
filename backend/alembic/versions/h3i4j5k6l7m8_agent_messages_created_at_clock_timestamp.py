"""agent_messages created_at default clock_timestamp

Revision ID: h3i4j5k6l7m8
Revises: 6d5e21be6a2f
Create Date: 2026-05-20

PostgreSQL `now()` in DEFAULT is transaction-scoped; multiple INSERTs in one
transaction share the same timestamp, so ORDER BY created_at, id can mis-order
user vs assistant when id is a random UUID. Use clock_timestamp() per row.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h3i4j5k6l7m8"
down_revision: Union[str, Sequence[str], None] = "6d5e21be6a2f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "agent_messages",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        server_default=sa.text("clock_timestamp()"),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "agent_messages",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        server_default=sa.text("now()"),
        existing_nullable=False,
    )
