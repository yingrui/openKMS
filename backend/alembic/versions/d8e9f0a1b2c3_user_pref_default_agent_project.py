"""user_preferences default_agent_project_id

Revision ID: d8e9f0a1b2c3
Revises: c7e8f9a0b1d2
Create Date: 2026-11-04

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d8e9f0a1b2c3"
down_revision: Union[str, Sequence[str], None] = "c7e8f9a0b1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("default_agent_project_id", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "default_agent_project_id")
