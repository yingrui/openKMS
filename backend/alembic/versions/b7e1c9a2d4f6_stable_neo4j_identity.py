"""Give object types and link types a graph identity that survives a rename.

The Neo4j label was derived from `object_types.name` on every read. Renaming a type therefore
pointed all reads at a label nothing was indexed under: the objects looked deleted, and the old
nodes were unreachable. The same was true for link types and their relationship type.

Both new columns are assigned once at creation. The backfill reproduces exactly what the
name-derived code produced (`[^A-Za-z0-9_]` -> `_`), so existing graphs keep working untouched.

Revision ID: b7e1c9a2d4f6
Revises: d4e5f6a7b8c9
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7e1c9a2d4f6"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# `re.sub(r"[^a-zA-Z0-9_]", "_", name)` in Python; the fallbacks match the helpers there.
_BACKFILL = (
    "COALESCE(NULLIF(regexp_replace({col}, '[^a-zA-Z0-9_]', '_', 'g'), ''), '{fallback}')"
)


def upgrade() -> None:
    op.add_column("object_types", sa.Column("neo4j_label", sa.String(length=256), nullable=True))
    op.add_column("link_types", sa.Column("neo4j_rel_type", sa.String(length=256), nullable=True))

    op.execute(
        "UPDATE object_types SET neo4j_label = "
        + _BACKFILL.format(col="name", fallback="Node")
        + " WHERE neo4j_label IS NULL"
    )
    op.execute(
        "UPDATE link_types SET neo4j_rel_type = "
        + _BACKFILL.format(col="name", fallback="relates_to")
        + " WHERE neo4j_rel_type IS NULL"
    )


def downgrade() -> None:
    op.drop_column("link_types", "neo4j_rel_type")
    op.drop_column("object_types", "neo4j_label")
