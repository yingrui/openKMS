"""Drop per-document resource_acl_entries (channel-only document access).

Revision ID: o4p5q6r7s8t9
Revises: n3o4p5q6r7s8
Create Date: 2026-06-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "o4p5q6r7s8t9"
down_revision: Union[str, None] = "n3o4p5q6r7s8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text("DELETE FROM resource_acl_entries WHERE resource_type = 'document'")
    )


def downgrade() -> None:
    pass
