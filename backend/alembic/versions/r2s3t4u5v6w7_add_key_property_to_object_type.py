"""add_key_property_to_object_type

Revision ID: r2s3t4u5v6w7
Revises: p1q2r3s4t5u6
Create Date: 2026-03-19

Add key_property to object_types for explicit primary key selection.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "r2s3t4u5v6w7"
down_revision: Union[str, None] = "p1q2r3s4t5u6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("object_types", sa.Column("key_property", sa.String(128), nullable=True))


def downgrade() -> None:
    op.drop_column("object_types", "key_property")
