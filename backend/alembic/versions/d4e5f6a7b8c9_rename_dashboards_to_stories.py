"""Rename dashboards to stories (and their reports to findings).

The object is a *story* — a narrative with evidence — and what it holds is a *finding*. This is a pure
rename: ids, ACL rows and permission keys (`insights:read` / `insights:write`, the app's, not the
object's) are untouched, so grants carry over without a backfill.

Also re-applies the default patterns, because the `insights` routes changed path (`/api/dashboards` →
`/api/stories`); a constant change alone never updates an existing database.

Revision ID: d4e5f6a7b8c9
Revises: c2d3e4f5a6b8
"""

from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c2d3e4f5a6b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _rename_insight_key(finding: str, to: str) -> str:
    return (
        "CASE WHEN {f} ? 'insight' "
        "THEN ({f} - 'insight') || jsonb_build_object('{to}', {f}->'insight') "
        "ELSE {f} END"
    ).format(f=finding, to=to)


def _rewrite_keys(table: str, column: str, new_key: str) -> None:
    """Move each element's `insight` to the new key, in place."""
    op.execute(
        f"""
        UPDATE {table} SET {column} = COALESCE((
            SELECT jsonb_agg({_rename_insight_key('f', new_key)})
            FROM jsonb_array_elements({column}) AS f
        ), '[]'::jsonb)
        WHERE {column} IS NOT NULL
        """
    )


def _reapply_patterns() -> None:
    conn = op.get_bind()
    if "security_permissions" not in sa.inspect(conn).get_table_names():
        return

    from app.services.permissions.permission_catalog import OPERATION_KEY_HINTS
    from app.services.permissions.permission_default_patterns import default_patterns_for_key

    for hint in OPERATION_KEY_HINTS:
        fe, be = default_patterns_for_key(hint.key)
        conn.execute(
            sa.text(
                """
                UPDATE security_permissions SET
                  frontend_route_patterns = CAST(:fe AS jsonb),
                  backend_api_patterns = CAST(:be AS jsonb)
                WHERE key = :k
                """
            ),
            {"fe": json.dumps(fe), "be": json.dumps(be), "k": hint.key},
        )


def upgrade() -> None:
    op.rename_table("dashboards", "stories")
    op.alter_column("stories", "reports", new_column_name="findings")
    _rewrite_keys("stories", "findings", "takeaway")
    _reapply_patterns()


def downgrade() -> None:
    op.execute(
        """
        UPDATE stories SET findings = COALESCE((
            SELECT jsonb_agg(
                CASE WHEN f ? 'takeaway'
                     THEN (f - 'takeaway') || jsonb_build_object('insight', f->'takeaway')
                     ELSE f END)
            FROM jsonb_array_elements(findings) AS f
        ), '[]'::jsonb)
        WHERE findings IS NOT NULL
        """
    )
    op.alter_column("stories", "findings", new_column_name="reports")
    op.rename_table("stories", "dashboards")
    _reapply_patterns()
