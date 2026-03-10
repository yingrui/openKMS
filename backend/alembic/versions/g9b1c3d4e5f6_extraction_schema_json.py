"""extraction_schema json instead of jsonb

Revision ID: g9b1c3d4e5f6
Revises: f8a0b2c3d4e5
Create Date: 2026-03-09 23:00:00.000000

PostgreSQL json type preserves object key order; jsonb does not.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'g9b1c3d4e5f6'
down_revision: Union[str, None] = 'f8a0b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'document_channels',
        'extraction_schema',
        type_=postgresql.JSON(),
        postgresql_using='extraction_schema::text::json',
    )


def downgrade() -> None:
    op.alter_column(
        'document_channels',
        'extraction_schema',
        type_=postgresql.JSONB(),
        postgresql_using='extraction_schema::text::jsonb',
    )
