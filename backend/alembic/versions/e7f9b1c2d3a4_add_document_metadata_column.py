"""add_document_metadata_column

Revision ID: e7f9b1c2d3a4
Revises: d6a4b3c8e9f2
Create Date: 2026-03-09 22:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e7f9b1c2d3a4'
down_revision: Union[str, None] = 'd6a4b3c8e9f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = :c)"
    ), {"t": table_name, "c": column_name})
    return result.scalar()


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, 'documents', 'metadata'):
        op.add_column(
            'documents',
            sa.Column('metadata', postgresql.JSONB(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column('documents', 'metadata')
