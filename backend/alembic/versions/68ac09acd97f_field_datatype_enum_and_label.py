"""Conform fields/metrics to the Ossie core spec.

Three fixes so the *stored* shape matches `core-spec/spec.md` (not just the export):

- `datatype` becomes the spec's `DataType` enum (`string`→`String`, `number`→`Decimal`, …).
- `dimension` keeps **only** `is_time` — our `granularity` extension is dropped.
- `semantic_model_fields.label` is added (a spec Field property).

Revision ID: 68ac09acd97f
Revises: f0a1b2c3d4e5
Create Date: 2026-06-08
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "68ac09acd97f"
down_revision: Union[str, Sequence[str], None] = "f0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Our earlier internal names -> the spec's DataType enum.
_DATATYPE_MAP = {
    "string": "String",
    "number": "Decimal",
    "integer": "Integer",
    "float": "Float",
    "boolean": "Boolean",
    "date": "Date",
    "time": "Time",
    "datetime": "DateTimeTz",
    "uuid": "String",
}

_TABLES = ("semantic_model_fields", "metric_definitions")


def upgrade() -> None:
    for table in _TABLES:
        for old, new in _DATATYPE_MAP.items():
            op.execute(f"UPDATE {table} SET datatype = '{new}' WHERE lower(datatype) = '{old}'")

    # Dimension is `{is_time}` only — drop our granularity extension.
    op.execute(
        "UPDATE semantic_model_fields SET dimension = dimension - 'granularity' "
        "WHERE dimension IS NOT NULL"
    )
    op.execute("UPDATE semantic_model_fields SET dimension = NULL WHERE dimension = '{}'::jsonb")

    op.add_column("semantic_model_fields", sa.Column("label", sa.String(length=256), nullable=True))


def downgrade() -> None:
    op.drop_column("semantic_model_fields", "label")

    reverse = {new: old for old, new in _DATATYPE_MAP.items()}
    for table in _TABLES:
        for new, old in reverse.items():
            op.execute(f"UPDATE {table} SET datatype = '{old}' WHERE datatype = '{new}'")
    # `granularity` is not restored (it no longer has a home in the spec shape).
