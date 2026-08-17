"""Add ontology_apps table and refresh ontology permission patterns.

Revision ID: i0j1k2l3m4n5
Revises: h9i0j1k2l3m4
Create Date: 2026-08-17
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "i0j1k2l3m4n5"
down_revision: Union[str, Sequence[str], None] = "h9i0j1k2l3m4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ontology_apps",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("api_name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("template_id", sa.String(length=64), server_default="kanban", nullable=False),
        sa.Column("bindings", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("draft_a2ui", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("published_a2ui", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("bindings_hash", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="draft", nullable=False),
        sa.Column("created_by", sa.String(length=512), nullable=True),
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("api_name"),
    )
    op.create_index("ix_ontology_apps_api_name", "ontology_apps", ["api_name"], unique=False)

    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "security_permissions" in insp.get_table_names():
        import json

        from app.services.permissions.permission_catalog import PERM_ONTOLOGY_READ, PERM_ONTOLOGY_WRITE
        from app.services.permissions.permission_default_patterns import default_patterns_for_key

        for key in (PERM_ONTOLOGY_READ, PERM_ONTOLOGY_WRITE):
            fe, be = default_patterns_for_key(key)
            bind.execute(
                sa.text(
                    """
                    UPDATE security_permissions SET
                      frontend_route_patterns = CAST(:fe AS jsonb),
                      backend_api_patterns = CAST(:be AS jsonb)
                    WHERE key = :k
                    """
                ),
                {"fe": json.dumps(fe), "be": json.dumps(be), "k": key},
            )


def downgrade() -> None:
    op.drop_index("ix_ontology_apps_api_name", table_name="ontology_apps")
    op.drop_table("ontology_apps")
