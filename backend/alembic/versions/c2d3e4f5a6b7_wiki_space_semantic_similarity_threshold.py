"""wiki_spaces: semantic similarity threshold for page match API

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-05-07

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "wiki_spaces",
        sa.Column(
            "semantic_similarity_threshold",
            sa.Float(),
            nullable=False,
            server_default="0.8",
        ),
    )
    op.create_check_constraint(
        "ck_wiki_spaces_semantic_similarity_threshold",
        "wiki_spaces",
        "semantic_similarity_threshold >= 0 AND semantic_similarity_threshold <= 1",
    )


def downgrade() -> None:
    op.drop_constraint("ck_wiki_spaces_semantic_similarity_threshold", "wiki_spaces", type_="check")
    op.drop_column("wiki_spaces", "semantic_similarity_threshold")
