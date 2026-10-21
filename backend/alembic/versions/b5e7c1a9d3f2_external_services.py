"""Named external HTTP services for Ontology Functions.

Revision ID: b5e7c1a9d3f2
Revises: d9e0f1a2b3c4
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b5e7c1a9d3f2"
down_revision: Union[str, Sequence[str], None] = "d9e0f1a2b3c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "external_services",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("api_name", sa.String(length=128), nullable=False),
        sa.Column("display_name", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("base_url", sa.String(length=512), nullable=False),
        sa.Column("auth_kind", sa.String(length=16), server_default="none", nullable=False),
        sa.Column("auth_header_name", sa.String(length=128), nullable=True),
        sa.Column("secret_encrypted", sa.Text(), nullable=True),
        sa.Column(
            "allowed_paths",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("timeout_seconds", sa.Integer(), server_default="10", nullable=False),
        sa.Column("created_by", sa.String(length=512), nullable=True),
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_external_services_api_name", "external_services", ["api_name"], unique=True)
    op.create_index("ix_external_services_created_by", "external_services", ["created_by"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_external_services_created_by", table_name="external_services")
    op.drop_index("ix_external_services_api_name", table_name="external_services")
    op.drop_table("external_services")
