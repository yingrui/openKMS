"""Add media channels, media assets, media permissions, and media feature toggle.

Revision ID: m7n8o9p0q1r2
Revises: g1h2i3j4k5l6
Create Date: 2026-06-18
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m7n8o9p0q1r2"
down_revision: Union[str, Sequence[str], None] = "g1h2i3j4k5l6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(insp, table: str) -> set[str]:
    if table not in insp.get_table_names():
        return set()
    return {ix["name"] for ix in insp.get_indexes(table)}


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = set(insp.get_table_names())

    if "media_channels" not in tables:
        op.create_table(
            "media_channels",
            sa.Column("id", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=256), nullable=False),
            sa.Column("description", sa.String(length=1024), nullable=True),
            sa.Column("parent_id", sa.String(length=64), nullable=True),
            sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
            sa.Column("metadata_schema", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("default_image_model_id", sa.String(length=64), nullable=True),
            sa.Column("default_video_model_id", sa.String(length=64), nullable=True),
            sa.Column("created_by", sa.String(length=512), nullable=True),
            sa.Column("created_by_name", sa.String(length=256), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["parent_id"], ["media_channels.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["default_image_model_id"], ["api_models.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["default_video_model_id"], ["api_models.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        tables.add("media_channels")

    insp = sa.inspect(conn)
    if "ix_media_channels_parent_id" not in _index_names(insp, "media_channels"):
        op.create_index(op.f("ix_media_channels_parent_id"), "media_channels", ["parent_id"], unique=False)
    if "ix_media_channels_created_by" not in _index_names(insp, "media_channels"):
        op.create_index(op.f("ix_media_channels_created_by"), "media_channels", ["created_by"], unique=False)

    insp = sa.inspect(conn)
    tables = set(insp.get_table_names())
    if "media_assets" not in tables:
        op.create_table(
            "media_assets",
            sa.Column("id", sa.String(length=64), nullable=False),
            sa.Column("channel_id", sa.String(length=64), nullable=False),
            sa.Column("media_kind", sa.String(length=16), nullable=False),
            sa.Column("title", sa.String(length=512), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("captured_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("location", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("storage_key", sa.String(length=1024), nullable=False),
            sa.Column("thumbnail_key", sa.String(length=1024), nullable=True),
            sa.Column("poster_key", sa.String(length=1024), nullable=True),
            sa.Column("content_type", sa.String(length=128), nullable=True),
            sa.Column("width", sa.Integer(), nullable=True),
            sa.Column("height", sa.Integer(), nullable=True),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column("provenance", sa.String(length=32), server_default="uploaded", nullable=False),
            sa.Column("generation", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("series_id", sa.String(length=64), nullable=False),
            sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
            sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
            sa.Column("lifecycle_status", sa.String(length=32), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["channel_id"], ["media_channels.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
        )

    insp = sa.inspect(conn)
    for ix_name, cols in (
        ("ix_media_assets_channel_id", ["channel_id"]),
        ("ix_media_assets_media_kind", ["media_kind"]),
        ("ix_media_assets_series_id", ["series_id"]),
        ("ix_media_assets_lifecycle_status", ["lifecycle_status"]),
    ):
        if ix_name not in _index_names(insp, "media_assets"):
            op.create_index(op.f(ix_name), "media_assets", cols, unique=False)

    if "feature_toggles" in tables:
        conn.execute(
            sa.text(
                "INSERT INTO feature_toggles (key, enabled) SELECT 'media', false "
                "WHERE NOT EXISTS (SELECT 1 FROM feature_toggles WHERE key = 'media')"
            )
        )

    _seed_media_permissions(conn)


def _seed_media_permissions(conn) -> None:
    if "security_permissions" not in sa.inspect(conn).get_table_names():
        return

    from app.services.permissions.permission_catalog import OPERATION_KEY_HINTS, PERM_MEDIA_READ, PERM_MEDIA_WRITE
    from app.services.permissions.permission_default_patterns import default_patterns_for_key

    hints_by_key = {h.key: h for h in OPERATION_KEY_HINTS}
    for key in (PERM_MEDIA_READ, PERM_MEDIA_WRITE):
        hint = hints_by_key.get(key)
        if not hint:
            continue
        fe, be = default_patterns_for_key(key)
        fe_json = json.dumps(fe)
        be_json = json.dumps(be)
        row = conn.execute(
            sa.text("SELECT id FROM security_permissions WHERE key = :k LIMIT 1"),
            {"k": key},
        ).fetchone()
        if row:
            conn.execute(
                sa.text(
                    """
                    UPDATE security_permissions SET
                      label = :label,
                      description = :desc,
                      frontend_route_patterns = CAST(:fe AS jsonb),
                      backend_api_patterns = CAST(:be AS jsonb)
                    WHERE key = :k
                    """
                ),
                {
                    "label": hint.label,
                    "desc": hint.description,
                    "fe": fe_json,
                    "be": be_json,
                    "k": key,
                },
            )
        else:
            max_ord = conn.execute(
                sa.text("SELECT COALESCE(MAX(sort_order), -1) FROM security_permissions")
            ).scalar()
            conn.execute(
                sa.text(
                    """
                    INSERT INTO security_permissions
                    (id, key, label, description, frontend_route_patterns, backend_api_patterns, sort_order)
                    VALUES
                    (:id, :k, :label, :desc, CAST(:fe AS jsonb), CAST(:be AS jsonb), :ord)
                    """
                ),
                {
                    "id": str(uuid.uuid4()),
                    "k": key,
                    "label": hint.label,
                    "desc": hint.description,
                    "fe": fe_json,
                    "be": be_json,
                    "ord": int(max_ord) + 1,
                },
            )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    names = set(insp.get_table_names())

    if "feature_toggles" in names:
        conn.execute(sa.text("DELETE FROM feature_toggles WHERE key = 'media'"))

    if "security_permissions" in names:
        conn.execute(sa.text("DELETE FROM security_permissions WHERE key IN ('media:read', 'media:write')"))

    if "media_assets" in names:
        insp2 = sa.inspect(conn)
        for ix in (
            "ix_media_assets_lifecycle_status",
            "ix_media_assets_series_id",
            "ix_media_assets_media_kind",
            "ix_media_assets_channel_id",
        ):
            if ix in _index_names(insp2, "media_assets"):
                op.drop_index(op.f(ix), table_name="media_assets")
        op.drop_table("media_assets")

    if "media_channels" in names:
        insp2 = sa.inspect(conn)
        for ix in ("ix_media_channels_created_by", "ix_media_channels_parent_id"):
            if ix in _index_names(insp2, "media_channels"):
                op.drop_index(op.f(ix), table_name="media_channels")
        op.drop_table("media_channels")
