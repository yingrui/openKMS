"""Identity can be a composite key.

A table unique on `(portfolio_id, ts_code)` has no single-column identity, and the ontology could
only name one property — so such a type had to borrow a surrogate column and pretend it was the
key. `key_properties` holds the columns (1..n); the API id is their encoded join (`a|b`).

Revision ID: b2c3d4e5f6a8
Revises: z9a0b1c2d3e4
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b2c3d4e5f6a8"
down_revision: Union[str, Sequence[str], None] = "z9a0b1c2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "object_types",
        sa.Column(
            "key_properties",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
    )
    # A single key was the only shape before, so every existing value becomes a one-element list.
    op.execute(
        """
        UPDATE object_types
        SET key_properties = jsonb_build_array(key_property)
        WHERE key_property IS NOT NULL AND btrim(key_property) <> ''
        """
    )
    op.drop_column("object_types", "key_property")


def downgrade() -> None:
    op.add_column("object_types", sa.Column("key_property", sa.String(length=128), nullable=True))
    op.execute(
        """
        UPDATE object_types
        SET key_property = key_properties ->> 0
        WHERE jsonb_array_length(key_properties) = 1
        """
    )
    op.execute("DELETE FROM object_types WHERE jsonb_array_length(key_properties) > 1")
    op.drop_column("object_types", "key_properties")
