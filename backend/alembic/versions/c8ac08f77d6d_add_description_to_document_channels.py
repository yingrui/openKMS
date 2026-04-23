"""add_description_to_document_channels

Revision ID: c8ac08f77d6d
Revises: f0e1d2c3b4a5
Create Date: 2026-03-08 00:23:23.965307

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8ac08f77d6d'
down_revision: Union[str, Sequence[str], None] = "f0e1d2c3b4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :t AND column_name = :c)"
        ),
        {"t": table_name, "c": column_name},
    )
    return bool(result.scalar())


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    if not _column_exists(conn, "document_channels", "description"):
        op.add_column(
            "document_channels",
            sa.Column("description", sa.String(1024), nullable=True),
        )


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    if _column_exists(conn, "document_channels", "description"):
        op.drop_column("document_channels", "description")
