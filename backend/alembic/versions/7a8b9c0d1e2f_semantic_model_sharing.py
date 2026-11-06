"""Semantic models become securable; backfill an owner grant for existing rows.

Revision ID: 7a8b9c0d1e2f
Revises: 4f5a6b7c8d9e
Create Date: 2026-11-06

A semantic model is a definition — which datasets, metrics, fields and relationships a caller
may see — so it needs the same sharing mechanics as a dataset or a knowledge base. Before this,
visibility was decided by `data:read` alone, and `access_mode` had to double as the model-level
gate.

Existing models get an **owner-only** grant, matching `bootstrap_owner_acl`: no Others row, so a
model with a grant is closed to everyone except its grantee list. That is the same closure rule
every other securable type follows, and it is why this migration writes rows only for models
whose creator is known.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "7a8b9c0d1e2f"
down_revision: Union[str, Sequence[str], None] = "4f5a6b7c8d9e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

#: Owner rwm, the same bits `bootstrap_owner_acl` grants.
PERM_RWM = 1 | 2 | 4


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if not {"semantic_models", "resource_acl_entries"} <= tables:
        return

    rows = bind.execute(
        sa.text("SELECT id, created_by FROM semantic_models WHERE created_by IS NOT NULL")
    ).fetchall()
    for model_id, creator in rows:
        exists = bind.execute(
            sa.text(
                "SELECT 1 FROM resource_acl_entries "
                "WHERE resource_type = 'semantic_model' AND resource_id = :rid LIMIT 1"
            ),
            {"rid": model_id},
        ).fetchone()
        if exists:
            continue
        bind.execute(
            sa.text(
                "INSERT INTO resource_acl_entries "
                "(id, resource_type, resource_id, grantee_type, grantee_id, permissions) "
                "VALUES (:id, 'semantic_model', :rid, 'user', :gid, :perms)"
            ),
            {
                "id": _uuid(),
                "rid": model_id,
                "gid": creator,
                "perms": PERM_RWM,
            },
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "resource_acl_entries" not in insp.get_table_names():
        return
    bind.execute(
        sa.text("DELETE FROM resource_acl_entries WHERE resource_type = 'semantic_model'")
    )


def _uuid() -> str:
    import uuid

    return str(uuid.uuid4())
