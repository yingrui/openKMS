"""Rename taxonomy_resource_links.taxonomy_node_id → knowledge_map_node_id.

Revision ID: p0q1r2s3t4u5
Revises: m5n6o7p8q9r0
Create Date: 2026-05-20

PostgreSQL: column rename preserves FK; index is renamed for clarity.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "p0q1r2s3t4u5"
down_revision = "m5n6o7p8q9r0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "ALTER TABLE taxonomy_resource_links RENAME COLUMN taxonomy_node_id TO knowledge_map_node_id"
        )
    )
    op.execute(
        sa.text(
            "ALTER INDEX ix_taxonomy_resource_links_taxonomy_node_id "
            "RENAME TO ix_taxonomy_resource_links_knowledge_map_node_id"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "ALTER INDEX ix_taxonomy_resource_links_knowledge_map_node_id "
            "RENAME TO ix_taxonomy_resource_links_taxonomy_node_id"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE taxonomy_resource_links RENAME COLUMN knowledge_map_node_id TO taxonomy_node_id"
        )
    )
