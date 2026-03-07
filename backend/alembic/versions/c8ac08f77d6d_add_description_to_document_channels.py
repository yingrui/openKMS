"""add_description_to_document_channels

Revision ID: c8ac08f77d6d
Revises: 
Create Date: 2026-03-08 00:23:23.965307

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8ac08f77d6d'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'document_channels',
        sa.Column('description', sa.String(1024), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('document_channels', 'description')
