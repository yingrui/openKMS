"""Add dataset catalog columns (description, owner, domain, tags, definition, sensitivity).

Revision ID: f3b2a1c4d5e6
Revises: e9f0a1b2c3d4
Create Date: 2026-06-08
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f3b2a1c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e9f0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("description", sa.Text()),
    ("owner_sub", sa.String(length=512)),
    ("domain", sa.String(length=128)),
    ("tags", postgresql.JSONB(astext_type=sa.Text())),
    ("business_definition", sa.Text()),
    ("sensitivity", sa.String(length=32)),
)


def upgrade() -> None:
    for name, type_ in _COLUMNS:
        op.add_column("datasets", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_COLUMNS):
        op.drop_column("datasets", name)
