"""Add app_components + app_published_versions; migrate single-source apps to components.

Revision ID: e1f2a3b4c5d6
Revises: j1k2l3m4n5o6
Create Date: 2026-08-30
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "j1k2l3m4n5o6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "app_components",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("app_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("a2ui_messages", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["app_id"], ["ontology_apps.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_app_components_app_id", "app_components", ["app_id"], unique=False)

    op.create_table(
        "app_published_versions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("app_id", sa.String(length=64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("components", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("bindings", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_by", sa.String(length=512), nullable=True),
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["app_id"], ["ontology_apps.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_app_published_versions_app_id", "app_published_versions", ["app_id"], unique=False)

    op.add_column("ontology_apps", sa.Column("published_version_id", sa.String(length=64), nullable=True))

    # Data migration: single-source → one default component (+ v1 snapshot when published).
    from app.services.app_builder.a2ui import normalize_stored_a2ui_document

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT id, name, bindings, draft_a2ui, published_a2ui, created_by, created_by_name "
            "FROM ontology_apps"
        )
    ).mappings().all()

    for row in rows:
        app_id = row["id"]
        name = (row["name"] or "Main").strip() or "Main"
        draft_msgs = normalize_stored_a2ui_document(row["draft_a2ui"])
        published_msgs = normalize_stored_a2ui_document(row["published_a2ui"])

        component_msgs = draft_msgs or published_msgs
        if component_msgs:
            cid = str(uuid.uuid4())
            bind.execute(
                sa.text(
                    "INSERT INTO app_components (id, app_id, name, position, is_default, a2ui_messages) "
                    "VALUES (:id, :app_id, :name, 0, true, CAST(:msgs AS jsonb))"
                ),
                {"id": cid, "app_id": app_id, "name": name, "msgs": json.dumps(component_msgs)},
            )

        if published_msgs:
            vid = str(uuid.uuid4())
            cid = str(uuid.uuid4())
            components = [
                {"id": cid, "name": name, "position": 0, "is_default": True, "messages": published_msgs}
            ]
            bind.execute(
                sa.text(
                    "INSERT INTO app_published_versions "
                    "(id, app_id, version, components, bindings, created_by, created_by_name) "
                    "VALUES (:id, :app_id, 1, CAST(:components AS jsonb), CAST(:bindings AS jsonb), "
                    ":created_by, :created_by_name)"
                ),
                {
                    "id": vid,
                    "app_id": app_id,
                    "components": json.dumps(components),
                    "bindings": json.dumps(row["bindings"] or {}),
                    "created_by": row["created_by"],
                    "created_by_name": row["created_by_name"],
                },
            )
            bind.execute(
                sa.text("UPDATE ontology_apps SET published_version_id = :vid WHERE id = :app_id"),
                {"vid": vid, "app_id": app_id},
            )

    op.drop_column("ontology_apps", "draft_a2ui")
    op.drop_column("ontology_apps", "published_a2ui")


def downgrade() -> None:
    op.add_column("ontology_apps", sa.Column("draft_a2ui", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("ontology_apps", sa.Column("published_a2ui", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.drop_column("ontology_apps", "published_version_id")
    op.drop_index("ix_app_published_versions_app_id", table_name="app_published_versions")
    op.drop_table("app_published_versions")
    op.drop_index("ix_app_components_app_id", table_name="app_components")
    op.drop_table("app_components")
