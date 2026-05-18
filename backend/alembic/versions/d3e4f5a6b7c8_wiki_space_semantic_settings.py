"""wiki_spaces: semantic match top_k, embedding model override, last index time; default threshold 0.5

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-05-07

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d3e4f5a6b7c8"
down_revision: Union[str, Sequence[str], None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "wiki_spaces",
        sa.Column(
            "semantic_match_top_k",
            sa.Integer(),
            nullable=False,
            server_default="10",
        ),
    )
    op.create_check_constraint(
        "ck_wiki_spaces_semantic_match_top_k",
        "wiki_spaces",
        "semantic_match_top_k >= 1",
    )
    op.add_column(
        "wiki_spaces",
        sa.Column("semantic_embedding_model_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "wiki_spaces",
        sa.Column("last_semantic_index_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_wiki_spaces_semantic_embedding_model_id",
        "wiki_spaces",
        "api_models",
        ["semantic_embedding_model_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.alter_column(
        "wiki_spaces",
        "semantic_similarity_threshold",
        server_default="0.5",
    )


def downgrade() -> None:
    op.alter_column(
        "wiki_spaces",
        "semantic_similarity_threshold",
        server_default="0.8",
    )
    op.drop_constraint("fk_wiki_spaces_semantic_embedding_model_id", "wiki_spaces", type_="foreignkey")
    op.drop_column("wiki_spaces", "last_semantic_index_at")
    op.drop_column("wiki_spaces", "semantic_embedding_model_id")
    op.drop_constraint("ck_wiki_spaces_semantic_match_top_k", "wiki_spaces", type_="check")
    op.drop_column("wiki_spaces", "semantic_match_top_k")
