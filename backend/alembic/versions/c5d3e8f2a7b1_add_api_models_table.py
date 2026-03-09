"""add_api_models_table

Revision ID: c5d3e8f2a7b1
Revises: b4e2c7d9f1a3
Create Date: 2026-03-09 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'c5d3e8f2a7b1'
down_revision: Union[str, None] = 'b4e2c7d9f1a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, table_name: str) -> bool:
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"
    ), {"t": table_name})
    return result.scalar()


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = :c)"
    ), {"t": table_name, "c": column_name})
    return result.scalar()


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn, 'api_models'):
        op.create_table(
            'api_models',
            sa.Column('id', sa.String(64), primary_key=True),
            sa.Column('name', sa.String(256), nullable=False),
            sa.Column('provider', sa.String(256), nullable=False),
            sa.Column('category', sa.String(64), nullable=False),
            sa.Column('base_url', sa.String(512), nullable=False),
            sa.Column('api_key', sa.Text(), nullable=True),
            sa.Column('model_name', sa.String(256), nullable=True),
            sa.Column('config', postgresql.JSONB(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _column_exists(conn, 'pipelines', 'model_id'):
        op.add_column(
            'pipelines',
            sa.Column(
                'model_id', sa.String(64),
                sa.ForeignKey('api_models.id', ondelete='SET NULL'),
                nullable=True,
            ),
        )

    # Seed default PaddleOCR-VL model
    op.execute("""
        INSERT INTO api_models (id, name, provider, category, base_url, model_name, config)
        VALUES (
            'model_paddleocr_vl',
            'PaddleOCR-VL-1.5',
            'PaddlePaddle',
            'vl',
            'http://localhost:8101/',
            'PaddlePaddle/PaddleOCR-VL-1.5',
            '{"max_concurrency": 3}'::jsonb
        )
        ON CONFLICT (id) DO NOTHING
    """)

    # Link existing paddleocr pipeline to the seeded model
    op.execute("""
        UPDATE pipelines
        SET model_id = 'model_paddleocr_vl'
        WHERE id = 'pipeline_paddleocr'
          AND model_id IS NULL
    """)


def downgrade() -> None:
    op.drop_column('pipelines', 'model_id')
    op.drop_table('api_models')
