"""object types: event_config (Vertex-style event semantics)

Which properties mark the start and end of an event, so time filtering and the Rules app can treat
an object type as an event type. An instance may leave its end empty = still open.

Revision ID: e1a2b3c4d5f6
Revises: c5d7e9f1a3b4
Create Date: 2026-11-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "e1a2b3c4d5f6"
down_revision: Union[str, None] = "c5d7e9f1a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "object_types",
        sa.Column("event_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("object_types", "event_config")
