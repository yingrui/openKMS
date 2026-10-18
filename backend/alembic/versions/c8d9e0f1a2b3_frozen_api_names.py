"""Give object types and link types a frozen, readable api_name.

The UUID `id` is the opaque identity; code and Cypher need a name an author can type. That name
must not change once published Functions hold it as a string, so it is a column of its own and
`name` stays the display label.

Backfill reproduces what the resolvers already matched on: a name that is *already* a valid
identifier is kept verbatim (`governed_by` must not become `GovernedBy`), otherwise the ASCII runs
become PascalCase. Rows with no ASCII name (e.g. 中文) stay NULL — the type keeps resolving by
`name`, and Manager lets the owner claim an api_name once.

Revision ID: c8d9e0f1a2b3
Revises: b7e1c9a2d4f6
"""

from __future__ import annotations

import re
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, Sequence[str], None] = "b7e1c9a2d4f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_VALID = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
_SPLIT = re.compile(r"[^A-Za-z0-9]+")
_MAX = 128


def _derive(name: str | None) -> str | None:
    """Same rules as app/services/ontology/api_names.derive_api_name (kept local: a migration
    must not change behaviour when that module evolves)."""
    if name and len(name) <= _MAX and _VALID.match(name):
        return name
    parts = [p for p in _SPLIT.split(name or "") if p]
    if not parts:
        return None
    candidate = "".join(p[:1].upper() + p[1:] for p in parts)[:_MAX]
    if not candidate[:1].isalpha():
        candidate = f"Type{candidate}"[:_MAX]
    return candidate


def _unique(base: str, taken: set[str]) -> str:
    if base not in taken:
        return base
    for i in range(2, 1000):
        suffix = f"_{i}"
        candidate = base[: _MAX - len(suffix)] + suffix
        if candidate not in taken:
            return candidate
    raise RuntimeError(f"Too many rows share the api_name stem {base!r}")


def _backfill(table: str) -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text(f"SELECT id, name FROM {table} ORDER BY created_at, id")).fetchall()
    taken: set[str] = set()
    for row in rows:
        candidate = _derive(row.name)
        if candidate is None:
            continue
        api_name = _unique(candidate, taken)
        taken.add(api_name)
        bind.execute(
            sa.text(f"UPDATE {table} SET api_name = :api_name WHERE id = :id"),
            {"api_name": api_name, "id": row.id},
        )


def upgrade() -> None:
    op.add_column("object_types", sa.Column("api_name", sa.String(length=128), nullable=True))
    op.add_column("link_types", sa.Column("api_name", sa.String(length=128), nullable=True))
    op.create_index(
        "ix_object_types_api_name", "object_types", ["api_name"], unique=True
    )
    op.create_index("ix_link_types_api_name", "link_types", ["api_name"], unique=True)

    _backfill("object_types")
    _backfill("link_types")


def downgrade() -> None:
    op.drop_index("ix_link_types_api_name", table_name="link_types")
    op.drop_index("ix_object_types_api_name", table_name="object_types")
    op.drop_column("link_types", "api_name")
    op.drop_column("object_types", "api_name")
