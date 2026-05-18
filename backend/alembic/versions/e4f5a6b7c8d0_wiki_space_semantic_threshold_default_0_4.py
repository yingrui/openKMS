"""wiki_spaces: semantic_similarity_threshold server default 0.4

Revision ID: e4f5a6b7c8d0
Revises: d3e4f5a6b7c8
Create Date: 2026-05-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e4f5a6b7c8d0"
down_revision: Union[str, Sequence[str], None] = "d3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "wiki_spaces",
        "semantic_similarity_threshold",
        server_default="0.4",
        existing_type=sa.Float(),
    )


def downgrade() -> None:
    op.alter_column(
        "wiki_spaces",
        "semantic_similarity_threshold",
        server_default="0.5",
        existing_type=sa.Float(),
    )
