"""The audit log records what a thing was called, not only its id.

Revision ID: bf703fdb450c
Revises: x7y8z9a0b1c2
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "bf703fdb450c"
down_revision: Union[str, Sequence[str], None] = "x7y8z9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("audit_events", sa.Column("resource_label", sa.String(256), nullable=True))


def downgrade() -> None:
    op.drop_column("audit_events", "resource_label")
