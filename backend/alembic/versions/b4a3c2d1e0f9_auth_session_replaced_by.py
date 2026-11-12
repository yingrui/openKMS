"""Track the successor when a browser session is rotated on refresh.

Revision ID: d1e2f3a4b5c6
Revises: a9f8e7d6c5b4
Create Date: 2026-11-12
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b4a3c2d1e0f9"
down_revision: Union[str, Sequence[str], None] = "a9f8e7d6c5b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("auth_sessions", sa.Column("replaced_by", sa.String(length=128), nullable=True))


def downgrade() -> None:
    op.drop_column("auth_sessions", "replaced_by")
