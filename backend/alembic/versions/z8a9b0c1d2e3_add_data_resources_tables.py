"""Add data_resources and access_group_data_resources for ABAC-style group grants.

Revision ID: z8a9b0c1d2e3
Revises: w7x8y9z0a1b2
Create Date: 2026-04-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "z8a9b0c1d2e3"
down_revision: Union[str, Sequence[str], None] = "w7x8y9z0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS data_resources (
            id                        VARCHAR(36) PRIMARY KEY,
            name                      VARCHAR(256) NOT NULL UNIQUE,
            description               TEXT,
            resource_kind             VARCHAR(64) NOT NULL,
            attributes                JSONB NOT NULL DEFAULT '{}'::jsonb,
            anchor_channel_id         VARCHAR(64) REFERENCES document_channels(id) ON DELETE SET NULL,
            anchor_knowledge_base_id  VARCHAR(64) REFERENCES knowledge_bases(id) ON DELETE SET NULL,
            created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_data_resources_resource_kind ON data_resources (resource_kind)"))
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS access_group_data_resources (
            group_id          VARCHAR(36) NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
            data_resource_id  VARCHAR(36) NOT NULL REFERENCES data_resources(id) ON DELETE CASCADE,
            PRIMARY KEY (group_id, data_resource_id)
        )
    """))


def downgrade() -> None:
    op.drop_table("access_group_data_resources")
    op.drop_index("ix_data_resources_resource_kind", table_name="data_resources")
    op.drop_table("data_resources")
