"""Drop the fabricated 'Default model'.

An earlier migration parked pre-existing global metrics/fields in an auto-created
"Default model". A semantic model is a named scope the user creates — if there is
none, there is simply none. Deleting it cascades to its fields/membership.

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-06-08
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, Sequence[str], None] = "c6d7e8f9a0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM semantic_models WHERE id = 'default'")


def downgrade() -> None:
    pass
