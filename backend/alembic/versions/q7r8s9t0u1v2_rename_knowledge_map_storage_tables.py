"""Rename Knowledge Map PostgreSQL tables; scrub legacy index/constraint names and placeholders.

- ``taxonomy_map_html_artifact`` → ``knowledge_map_html_artifact``
- ``taxonomy_nodes`` → ``knowledge_map_nodes``
- ``taxonomy_resource_links`` → ``knowledge_map_resource_links``
- Rename indexes/constraints on those tables whose names still use the legacy prefix
- Replace legacy HTML node token prefix in stored overview HTML and designer chat messages
- Remove legacy ``/taxonomy`` path strings from ``security_permissions`` pattern JSON (if any)

Revision ID: q7r8s9t0u1v2
Revises: p0q1r2s3t4u5
"""

from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision = "q7r8s9t0u1v2"
down_revision = "p0q1r2s3t4u5"
branch_labels = None
depends_on = None

_PLACEHOLDER_OLD = "{{TAXONOMY_NODE:"
_PLACEHOLDER_NEW = "{{KNOWLEDGE_MAP_NODE:"


def _rename_indexes(conn: sa.Connection) -> None:
    rows = conn.execute(
        text(
            """
            SELECT n.nspname AS sc, c.relname AS idx
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_index i ON i.indexrelid = c.oid
            JOIN pg_class t ON t.oid = i.indrelid
            WHERE c.relkind = 'i'
              AND n.nspname = 'public'
              AND t.relname IN (
                  'knowledge_map_nodes',
                  'knowledge_map_resource_links',
                  'knowledge_map_html_artifact'
              )
              AND c.relname ILIKE '%taxonomy%'
            """
        )
    ).fetchall()
    for sc, idx in rows:
        new = idx.replace("taxonomy_", "knowledge_map_")
        if new == idx:
            continue
        conn.execute(text(f'ALTER INDEX "{sc}"."{idx}" RENAME TO "{new}"'))


def _rename_constraints(conn: sa.Connection) -> None:
    rows = conn.execute(
        text(
            """
            SELECT t.relname AS tbl, c.conname
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'public'
              AND t.relname IN (
                  'knowledge_map_nodes',
                  'knowledge_map_resource_links',
                  'knowledge_map_html_artifact'
              )
              AND c.conname ILIKE '%taxonomy%'
            """
        )
    ).fetchall()
    for tbl, cname in rows:
        newc = cname.replace("taxonomy_", "knowledge_map_")
        if newc == cname:
            continue
        conn.execute(text(f'ALTER TABLE "{tbl}" RENAME CONSTRAINT "{cname}" TO "{newc}"'))


def _scrub_permission_patterns(conn: sa.Connection) -> None:
    rows = conn.execute(
        text("SELECT id, frontend_route_patterns, backend_api_patterns FROM security_permissions")
    ).fetchall()

    for pid, fe, be in rows:
        fe_list = list(fe) if fe is not None else []
        be_list = list(be) if be is not None else []
        fe2 = [str(x) for x in fe_list if "taxonomy" not in str(x).lower()]
        be2 = [str(x) for x in be_list if "taxonomy" not in str(x).lower()]
        if fe2 == fe_list and be2 == be_list:
            continue
        conn.execute(
            text(
                "UPDATE security_permissions SET frontend_route_patterns = CAST(:fe AS jsonb), "
                "backend_api_patterns = CAST(:be AS jsonb) WHERE id = :id"
            ),
            {"fe": json.dumps(fe2), "be": json.dumps(be2), "id": pid},
        )


def upgrade() -> None:
    conn = op.get_bind()

    op.rename_table("taxonomy_map_html_artifact", "knowledge_map_html_artifact")
    op.rename_table("taxonomy_nodes", "knowledge_map_nodes")
    op.rename_table("taxonomy_resource_links", "knowledge_map_resource_links")

    _rename_indexes(conn)
    _rename_constraints(conn)

    conn.execute(
        text(
            "UPDATE knowledge_map_html_artifact SET html = replace(html, :old, :new) "
            "WHERE position(:old in html) > 0"
        ),
        {"old": _PLACEHOLDER_OLD, "new": _PLACEHOLDER_NEW},
    )
    conn.execute(
        text(
            """
            UPDATE agent_messages AS m
            SET content = replace(m.content, :old, :new)
            FROM agent_conversations AS c
            WHERE m.conversation_id = c.id
              AND c.surface = 'knowledge_map_html'
              AND position(:old in m.content) > 0
            """
        ),
        {"old": _PLACEHOLDER_OLD, "new": _PLACEHOLDER_NEW},
    )

    _scrub_permission_patterns(conn)


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(
        text(
            "UPDATE knowledge_map_html_artifact SET html = replace(html, :new, :old) "
            "WHERE position(:new in html) > 0"
        ),
        {"old": _PLACEHOLDER_OLD, "new": _PLACEHOLDER_NEW},
    )
    conn.execute(
        text(
            """
            UPDATE agent_messages AS m
            SET content = replace(m.content, :new, :old)
            FROM agent_conversations AS c
            WHERE m.conversation_id = c.id
              AND c.surface = 'knowledge_map_html'
              AND position(:new in m.content) > 0
            """
        ),
        {"old": _PLACEHOLDER_OLD, "new": _PLACEHOLDER_NEW},
    )

    op.rename_table("knowledge_map_resource_links", "taxonomy_resource_links")
    op.rename_table("knowledge_map_nodes", "taxonomy_nodes")
    op.rename_table("knowledge_map_html_artifact", "taxonomy_map_html_artifact")
