"""add_pipelines_and_job_queue_fields

Revision ID: a3f1b2c4d5e6
Revises: c8ac08f77d6d
Create Date: 2026-03-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a3f1b2c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'c8ac08f77d6d'
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

    if not _table_exists(conn, 'pipelines'):
        op.create_table(
            'pipelines',
            sa.Column('id', sa.String(64), primary_key=True),
            sa.Column('name', sa.String(256), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('command', sa.String(512), nullable=False),
            sa.Column('default_args', postgresql.JSONB(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _column_exists(conn, 'documents', 'status'):
        op.add_column('documents', sa.Column('status', sa.String(32), nullable=False, server_default='completed'))

    if not _column_exists(conn, 'document_channels', 'pipeline_id'):
        op.add_column(
            'document_channels',
            sa.Column('pipeline_id', sa.String(64), sa.ForeignKey('pipelines.id', ondelete='SET NULL'), nullable=True),
        )

    if not _column_exists(conn, 'document_channels', 'auto_process'):
        op.add_column(
            'document_channels',
            sa.Column('auto_process', sa.Boolean(), nullable=False, server_default='false'),
        )

    op.execute("""
        INSERT INTO pipelines (id, name, description, command, default_args)
        VALUES (
            'pipeline_paddleocr',
            'PaddleOCR Document Parse',
            'Parse documents using PaddleOCR-VL via openkms-cli',
            'openkms-cli pipeline run',
            '{"pipeline_name": "paddleocr-doc-parse"}'::jsonb
        )
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_column('document_channels', 'auto_process')
    op.drop_column('document_channels', 'pipeline_id')
    op.drop_column('documents', 'status')
    op.drop_table('pipelines')
