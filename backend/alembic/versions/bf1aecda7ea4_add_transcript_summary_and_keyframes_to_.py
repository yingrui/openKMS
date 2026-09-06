"""Add transcript, summary and keyframes to media_assets

Revision ID: bf1aecda7ea4
Revises: 054da7b54495
Create Date: 2026-09-03 16:33:02.858302

Autogenerate also reported pre-existing drift on unrelated tables (NOT NULL
backfills, index/constraint renames). That drift is not part of this change and
was stripped — this migration only adds the three media understanding columns.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'bf1aecda7ea4'
down_revision: Union[str, Sequence[str], None] = '054da7b54495'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('media_assets', sa.Column('transcript', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('media_assets', sa.Column('summary', sa.Text(), nullable=True))
    op.add_column('media_assets', sa.Column('keyframes', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('media_assets', 'keyframes')
    op.drop_column('media_assets', 'summary')
    op.drop_column('media_assets', 'transcript')
