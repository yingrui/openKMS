"""Add connectors.inputs and connectors.outputs JSONB.

Revision ID: t2u3v4w5x6y7
Revises: s1t2u3v4w5x6
Create Date: 2026-05-25
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "t2u3v4w5x6y7"
down_revision: Union[str, Sequence[str], None] = "s1t2u3v4w5x6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("connectors", sa.Column("inputs", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("connectors", sa.Column("outputs", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column("connectors", "outputs")
    op.drop_column("connectors", "inputs")
