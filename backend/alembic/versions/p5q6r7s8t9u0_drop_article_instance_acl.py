"""Drop per-article resource_acl_entries (channel-only article access).

Revision ID: p5q6r7s8t9u0
Revises: o4p5q6r7s8t9
Create Date: 2026-06-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "p5q6r7s8t9u0"
down_revision: Union[str, None] = "o4p5q6r7s8t9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text("DELETE FROM resource_acl_entries WHERE resource_type = 'article'")
    )


def downgrade() -> None:
    pass
