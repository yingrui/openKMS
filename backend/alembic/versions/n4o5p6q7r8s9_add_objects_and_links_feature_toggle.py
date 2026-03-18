"""add objectsAndLinks feature toggle

Revision ID: n4o5p6q7r8s9
Revises: 63e7b4c0b009
Create Date: 2026-03-17 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'n4o5p6q7r8s9'
down_revision: Union[str, Sequence[str], None] = '63e7b4c0b009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO feature_toggles (key, enabled)
        VALUES ('objectsAndLinks', true)
        ON CONFLICT (key) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM feature_toggles WHERE key = 'objectsAndLinks'")
