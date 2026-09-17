"""Add metadata-extraction config to article_channels and media_channels

Mirrors the document_channels extraction kit onto article and media channels so
articles and media assets support the same structured metadata extraction:
  extraction_model_id, extraction_schema, label_config,
  object_type_extraction_max_instances.

Revision ID: c1a2b3d4e5f6
Revises: bf1aecda7ea4
Create Date: 2026-09-06 20:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c1a2b3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'bf1aecda7ea4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_extraction_cols(table: str) -> None:
    op.add_column(table, sa.Column('extraction_model_id', sa.String(length=64), nullable=True))
    op.add_column(table, sa.Column('extraction_schema', sa.JSON(), nullable=True))
    op.add_column(table, sa.Column('label_config', sa.JSON(), nullable=True))
    op.add_column(
        table,
        sa.Column('object_type_extraction_max_instances', sa.Integer(), nullable=True, server_default='100'),
    )
    op.create_foreign_key(
        f'fk_{table}_extraction_model_id',
        table, 'api_models',
        ['extraction_model_id'], ['id'],
        ondelete='SET NULL',
    )


def _drop_extraction_cols(table: str) -> None:
    op.drop_constraint(f'fk_{table}_extraction_model_id', table, type_='foreignkey')
    op.drop_column(table, 'object_type_extraction_max_instances')
    op.drop_column(table, 'label_config')
    op.drop_column(table, 'extraction_schema')
    op.drop_column(table, 'extraction_model_id')


def upgrade() -> None:
    _add_extraction_cols('article_channels')
    _add_extraction_cols('media_channels')


def downgrade() -> None:
    _drop_extraction_cols('media_channels')
    _drop_extraction_cols('article_channels')
