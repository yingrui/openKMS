"""add_channel_extraction_fields

Revision ID: f8a0b2c3d4e5
Revises: e7f9b1c2d3a4
Create Date: 2026-03-09 22:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'f8a0b2c3d4e5'
down_revision: Union[str, None] = 'e7f9b1c2d3a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = :c)"
    ), {"t": table_name, "c": column_name})
    return result.scalar()


def _table_exists(conn, table_name: str) -> bool:
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"
    ), {"t": table_name})
    return result.scalar()


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, 'api_models'):
        return
    if not _column_exists(conn, 'document_channels', 'extraction_model_id'):
        op.add_column(
            'document_channels',
            sa.Column(
                'extraction_model_id',
                sa.String(64),
                sa.ForeignKey('api_models.id', ondelete='SET NULL'),
                nullable=True,
            ),
        )
    if not _column_exists(conn, 'document_channels', 'extraction_schema'):
        op.add_column(
            'document_channels',
            sa.Column('extraction_schema', postgresql.JSONB(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column('document_channels', 'extraction_schema')
    op.drop_column('document_channels', 'extraction_model_id')
