"""rename document_versions.label to tag

Revision ID: z4a5b6c7d8e9
Revises: y2z3a4b5c6d7
Create Date: 2026-03-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "z4a5b6c7d8e9"
down_revision: Union[str, None] = "y2z3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "document_versions",
        "label",
        new_column_name="tag",
        existing_type=sa.String(512),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "document_versions",
        "tag",
        new_column_name="label",
        existing_type=sa.String(512),
        existing_nullable=True,
    )
