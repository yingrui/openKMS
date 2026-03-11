"""ensure_sort_order_on_document_channels

Revision ID: j2e3f4g5h6i7
Revises: i1d2e3f4g5h6
Create Date: 2026-03-10

Add sort_order to document_channels if missing, so channel tree can sort by order at each level.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "j2e3f4g5h6i7"
down_revision: Union[str, None] = "i1d2e3f4g5h6"
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
    return result.scalar()


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "document_channels", "sort_order"):
        op.add_column(
            "document_channels",
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    op.drop_column("document_channels", "sort_order")
