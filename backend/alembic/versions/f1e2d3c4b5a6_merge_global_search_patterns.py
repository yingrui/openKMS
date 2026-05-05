"""Merge global search routes into read permission patterns.

Revision ID: f1e2d3c4b5a6
Revises: c4d5e6f7a8b9
Create Date: 2026-05-05
"""

from __future__ import annotations

import json
from typing import Any, Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1e2d3c4b5a6"
down_revision: Union[str, Sequence[str], None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_FE_ADD = ["/search", "/search/*"]
_BE_ADD = ["GET /api/search", "HEAD /api/search"]

_KEYS = ("documents:read", "articles:read", "knowledge_bases:read", "wikis:read")


def _as_list(val: Any) -> list[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return [str(x) for x in val]
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            return [str(x) for x in parsed] if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def _merge_unique(base: list[str], extra: list[str]) -> list[str]:
    out = list(base)
    for x in extra:
        if x not in out:
            out.append(x)
    return out


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return

    for key in _KEYS:
        row = conn.execute(
            sa.text(
                "SELECT frontend_route_patterns, backend_api_patterns FROM security_permissions WHERE key = :k LIMIT 1"
            ),
            {"k": key},
        ).mappings().first()
        if not row:
            continue
        fe = _as_list(row["frontend_route_patterns"])
        be = _as_list(row["backend_api_patterns"])
        fe2 = _merge_unique(fe, _FE_ADD)
        be2 = _merge_unique(be, _BE_ADD)
        conn.execute(
            sa.text(
                """
                UPDATE security_permissions SET
                  frontend_route_patterns = CAST(:fe AS jsonb),
                  backend_api_patterns = CAST(:be AS jsonb)
                WHERE key = :k
                """
            ),
            {"fe": json.dumps(fe2), "be": json.dumps(be2), "k": key},
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return

    for key in _KEYS:
        row = conn.execute(
            sa.text(
                "SELECT frontend_route_patterns, backend_api_patterns FROM security_permissions WHERE key = :k LIMIT 1"
            ),
            {"k": key},
        ).mappings().first()
        if not row:
            continue
        fe = [x for x in _as_list(row["frontend_route_patterns"]) if x not in _FE_ADD]
        be = [x for x in _as_list(row["backend_api_patterns"]) if x not in _BE_ADD]
        conn.execute(
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
