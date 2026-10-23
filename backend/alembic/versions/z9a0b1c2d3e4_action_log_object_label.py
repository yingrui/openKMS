"""Record what the Action acted on, not only its id.

A create has no incoming `object_id` — the object appears as a result — so its log row showed
"—". And for modify/delete the id alone says nothing a reader recognises. Both are fixed by
recording the created id and a label (the type's display/key property) at the time of the run,
when the object still exists.

Revision ID: z9a0b1c2d3e4
Revises: bf703fdb450c
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "z9a0b1c2d3e4"
down_revision: Union[str, Sequence[str], None] = "bf703fdb450c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ontology_action_log", sa.Column("object_label", sa.String(length=256), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("ontology_action_log", "object_label")
