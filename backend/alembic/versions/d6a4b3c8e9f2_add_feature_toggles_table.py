"""add_feature_toggles_table

Revision ID: d6a4b3c8e9f2
Revises: c5d3e8f2a7b1
Create Date: 2026-03-09 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd6a4b3c8e9f2'
down_revision: Union[str, None] = 'c5d3e8f2a7b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, table_name: str) -> bool:
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"
    ), {"t": table_name})
    return result.scalar()


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn, 'feature_toggles'):
        op.create_table(
            'feature_toggles',
            sa.Column('key', sa.String(64), primary_key=True),
            sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    op.execute("""
        INSERT INTO feature_toggles (key, enabled)
        VALUES ('articles', true), ('knowledgeBases', true)
        ON CONFLICT (key) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_table('feature_toggles')
