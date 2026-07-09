"""Seed example ontology function and refresh permission patterns.

Revision ID: g8h9i0j1k2l3
Revises: f7a8b9c0d1e2
Create Date: 2026-07-08
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g8h9i0j1k2l3"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED_SOURCE = '''"""Example: return a greeting using input name."""
from openkms_functions import ExecuteContext


def execute(input: dict, ctx: ExecuteContext) -> dict:
    name = (input or {}).get("name") or "world"
    return {"greeting": f"Hello, {name}!", "function": ctx.api_name, "version": ctx.version}
'''


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "ontology_functions" in insp.get_table_names():
        exists = conn.execute(
            sa.text("SELECT id FROM ontology_functions WHERE api_name = 'helloGreeting' LIMIT 1")
        ).fetchone()
        if not exists:
            fn_id = f"fn-{uuid.uuid4().hex[:12]}"
            ver_id = f"fnv-{uuid.uuid4().hex[:12]}"
            conn.execute(
                sa.text(
                    """
                    INSERT INTO ontology_functions
                      (id, api_name, display_name, description, source, development_status, status)
                    VALUES
                      (:id, 'helloGreeting', 'Hello Greeting', 'Seed example function', 'code', 'active', 'active')
                    """
                ),
                {"id": fn_id},
            )
            conn.execute(
                sa.text(
                    """
                    INSERT INTO ontology_function_versions
                      (id, function_id, version, source_code, entrypoint, runtime)
                    VALUES
                      (:ver_id, :fn_id, 1, :source, 'execute', 'python3')
                    """
                ),
                {"ver_id": ver_id, "fn_id": fn_id, "source": SEED_SOURCE},
            )
            conn.execute(
                sa.text("UPDATE ontology_functions SET published_version_id = :ver_id WHERE id = :fn_id"),
                {"ver_id": ver_id, "fn_id": fn_id},
            )

    if "security_permissions" in insp.get_table_names():
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


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM ontology_functions WHERE api_name = 'helloGreeting'"))
