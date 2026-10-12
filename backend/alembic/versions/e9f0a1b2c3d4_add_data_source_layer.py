"""Add data_sources.layer (data | ontology | null).

Revision ID: e9f0a1b2c3d4
Revises: b7c8d9e0f1a2
Create Date: 2026-06-08
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e9f0a1b2c3d4"
down_revision: Union[str, Sequence[str], None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("data_sources", sa.Column("layer", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("data_sources", "layer")
