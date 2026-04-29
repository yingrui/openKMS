"""Article channels, articles, versions, attachments, group scopes; seed articles permissions.

Revision ID: b8592f60dc11
Revises: a9b0c1d2e3f4
Create Date: 2026-04-28

Idempotent DDL: skips tables/indexes that already exist (e.g. partial apply) so
``alembic upgrade head`` can finish and permission rows still upsert.
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b8592f60dc11"
down_revision: Union[str, Sequence[str], None] = "a9b0c1d2e3f4"
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

    if "article_channels" not in tables:
        op.create_table(
            "article_channels",
            sa.Column("id", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=256), nullable=False),
            sa.Column("description", sa.String(length=1024), nullable=True),
            sa.Column("parent_id", sa.String(length=64), nullable=True),
            sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["parent_id"], ["article_channels.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        tables.add("article_channels")
    insp = sa.inspect(conn)
    if "ix_article_channels_parent_id" not in _index_names(insp, "article_channels"):
        op.create_index(op.f("ix_article_channels_parent_id"), "article_channels", ["parent_id"], unique=False)

    insp = sa.inspect(conn)
    tables = set(insp.get_table_names())
    if "articles" not in tables:
        op.create_table(
            "articles",
            sa.Column("id", sa.String(length=64), nullable=False),
            sa.Column("channel_id", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=512), nullable=False),
            sa.Column("slug", sa.String(length=256), nullable=True),
            sa.Column("markdown", sa.Text(), nullable=True),
            sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("series_id", sa.String(length=64), nullable=False),
            sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
            sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
            sa.Column("lifecycle_status", sa.String(length=32), nullable=True),
            sa.Column("origin_article_id", sa.String(length=512), nullable=True),
            sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["channel_id"], ["article_channels.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
        )
    insp = sa.inspect(conn)
    for ix_name, cols in (
        ("ix_articles_channel_id", ["channel_id"]),
        ("ix_articles_series_id", ["series_id"]),
        ("ix_articles_lifecycle_status", ["lifecycle_status"]),
        ("ix_articles_origin_article_id", ["origin_article_id"]),
        ("ix_articles_slug", ["slug"]),
    ):
        if ix_name not in _index_names(insp, "articles"):
            op.create_index(op.f(ix_name), "articles", cols, unique=False)
        insp = sa.inspect(conn)

    tables = set(insp.get_table_names())
    if "article_versions" not in tables:
        op.create_table(
            "article_versions",
            sa.Column("id", sa.String(length=64), nullable=False),
            sa.Column("article_id", sa.String(length=64), nullable=False),
            sa.Column("version_number", sa.Integer(), nullable=False),
            sa.Column("tag", sa.String(length=512), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("markdown", sa.Text(), nullable=True),
            sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("created_by_sub", sa.String(length=128), nullable=True),
            sa.Column("created_by_name", sa.String(length=256), nullable=True),
            sa.ForeignKeyConstraint(["article_id"], ["articles.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    insp = sa.inspect(conn)
    if "ix_article_versions_article_id" not in _index_names(insp, "article_versions"):
        op.create_index(op.f("ix_article_versions_article_id"), "article_versions", ["article_id"], unique=False)

    insp = sa.inspect(conn)
    tables = set(insp.get_table_names())
    if "article_attachments" not in tables:
        op.create_table(
            "article_attachments",
            sa.Column("id", sa.String(length=64), nullable=False),
            sa.Column("article_id", sa.String(length=64), nullable=False),
            sa.Column("storage_path", sa.String(length=1024), nullable=False),
            sa.Column("original_filename", sa.String(length=512), nullable=False),
            sa.Column("size_bytes", sa.Integer(), server_default="0", nullable=False),
            sa.Column("content_type", sa.String(length=256), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["article_id"], ["articles.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    insp = sa.inspect(conn)
    if "ix_article_attachments_article_id" not in _index_names(insp, "article_attachments"):
        op.create_index(
            op.f("ix_article_attachments_article_id"), "article_attachments", ["article_id"], unique=False
        )

    insp = sa.inspect(conn)
    tables = set(insp.get_table_names())
    if "access_group_article_channels" not in tables:
        op.create_table(
            "access_group_article_channels",
            sa.Column("group_id", sa.String(length=36), nullable=False),
            sa.Column("article_channel_id", sa.String(length=64), nullable=False),
            sa.ForeignKeyConstraint(["article_channel_id"], ["article_channels.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("group_id", "article_channel_id"),
        )

    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return

    from app.services.permission_catalog import OPERATION_KEY_HINTS
    from app.services.permission_default_patterns import default_patterns_for_key

    for hint in OPERATION_KEY_HINTS:
        fe, be = default_patterns_for_key(hint.key)
        if not fe and not be:
            continue
        fe_json = json.dumps(fe)
        be_json = json.dumps(be)
        row = conn.execute(
            sa.text("SELECT id FROM security_permissions WHERE key = :k LIMIT 1"),
            {"k": hint.key},
        ).fetchone()
        if row:
            conn.execute(
                sa.text(
                    """
                    UPDATE security_permissions SET
                      frontend_route_patterns = CAST(:fe AS jsonb),
                      backend_api_patterns = CAST(:be AS jsonb)
                    WHERE key = :k
                    """
                ),
                {"fe": fe_json, "be": be_json, "k": hint.key},
            )
        else:
            max_ord = conn.execute(sa.text("SELECT COALESCE(MAX(sort_order), -1) FROM security_permissions")).scalar()
            sort_order = int(max_ord) + 1
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
                    "k": hint.key,
                    "label": hint.label,
                    "desc": hint.description,
                    "fe": fe_json,
                    "be": be_json,
                    "ord": sort_order,
                },
            )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    names = set(insp.get_table_names())

    if "access_group_article_channels" in names:
        op.drop_table("access_group_article_channels")
    if "article_attachments" in names:
        if "ix_article_attachments_article_id" in _index_names(sa.inspect(conn), "article_attachments"):
            op.drop_index(op.f("ix_article_attachments_article_id"), table_name="article_attachments")
        op.drop_table("article_attachments")
    if "article_versions" in names:
        if "ix_article_versions_article_id" in _index_names(sa.inspect(conn), "article_versions"):
            op.drop_index(op.f("ix_article_versions_article_id"), table_name="article_versions")
        op.drop_table("article_versions")
    if "articles" in names:
        insp2 = sa.inspect(conn)
        for ix in (
            "ix_articles_slug",
            "ix_articles_origin_article_id",
            "ix_articles_lifecycle_status",
            "ix_articles_series_id",
            "ix_articles_channel_id",
        ):
            if ix in _index_names(insp2, "articles"):
                op.drop_index(op.f(ix), table_name="articles")
        op.drop_table("articles")
    if "article_channels" in names:
        if "ix_article_channels_parent_id" in _index_names(sa.inspect(conn), "article_channels"):
            op.drop_index(op.f("ix_article_channels_parent_id"), table_name="article_channels")
        op.drop_table("article_channels")
