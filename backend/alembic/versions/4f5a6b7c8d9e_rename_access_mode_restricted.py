"""Rename semantic-model access mode `gated` to `restricted`.

Revision ID: 4f5a6b7c8d9e
Revises: 6c1d2e3f4a5b
Create Date: 2026-11-06

`gated` described a state rather than the rule. `restricted` names what the value means — the
model is restricted to holders of a data-resource grant — and matches the vocabulary used by
the warehouses this Catalog fronts. The column is a plain string, so this rewrites existing
rows; the model layer no longer accepts `gated`.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "4f5a6b7c8d9e"
down_revision: Union[str, Sequence[str], None] = "6c1d2e3f4a5b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "semantic_models" not in insp.get_table_names():
        return
    bind.execute(
        sa.text("UPDATE semantic_models SET access_mode = 'restricted' WHERE access_mode = 'gated'")
    )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "semantic_models" not in insp.get_table_names():
        return
    bind.execute(
        sa.text("UPDATE semantic_models SET access_mode = 'gated' WHERE access_mode = 'restricted'")
    )
