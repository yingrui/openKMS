"""fix_document_status_default

Revision ID: p1q2r3s4t5u6
Revises: b13ff4a1796a
Create Date: 2026-03-17

Align document status column server_default with Python default.
Previously: server_default='completed' (conflicted with default='uploaded').
Now: server_default='uploaded' for consistent behavior on raw inserts.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "p1q2r3s4t5u6"
down_revision: Union[str, None] = "b13ff4a1796a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE documents ALTER COLUMN status SET DEFAULT 'uploaded'")


def downgrade() -> None:
    op.execute("ALTER TABLE documents ALTER COLUMN status SET DEFAULT 'completed'")
