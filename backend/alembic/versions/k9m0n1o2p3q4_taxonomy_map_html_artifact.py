"""taxonomy_map_html_artifact for LLM-generated Knowledge Map HTML

Revision ID: k9m0n1o2p3q4
Revises: h3i4j5k6l7m8
Create Date: 2026-05-20

Stores a single cached HTML document plus a semantic content hash so clients
can tell when the taxonomy changed since the snapshot was built.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "k9m0n1o2p3q4"
down_revision: Union[str, Sequence[str], None] = "h3i4j5k6l7m8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "taxonomy_map_html_artifact",
        sa.Column("id", sa.String(length=16), nullable=False),
        sa.Column("html", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("taxonomy_map_html_artifact")
