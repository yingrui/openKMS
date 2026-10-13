"""Dataset fields — the Ossie semantic field layer (column refs + computed expressions).

A field is a plain **column reference** (`column_name` + a column-ref `expression`)
or a **computed expression** (`column_name` is null). Seeding mirrors the physical
columns into field rows; the field list is the unit metrics/queries select.
"""
from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.dataset_field import DatasetField
from app.services.ontology.dataset_tables import is_valid_identifier, pg_engine_for_datasource
from app.services.ontology.property_types import (
    map_source_type_to_ontology,
    normalize_postgresql_column_type,
)

ANSI = "ANSI_SQL"
_NAME = re.compile(r"^[\w][\w .\-]*$")


class FieldValidationError(ValueError):
    """Raised when a field is invalid; surfaced as HTTP 400."""


def column_expression(column: str) -> dict[str, Any]:
    """The dialect expression for a plain column reference."""
    return {"dialects": {ANSI: f'"{column}"'}}


def expression_sql(expression: dict | None) -> str | None:
    """The ANSI_SQL fragment of an Ossie expression, if any."""
    if not isinstance(expression, dict):
        return None
    dialects = expression.get("dialects")
    if not isinstance(dialects, dict):
        return None
    value = dialects.get(ANSI)
    return value if isinstance(value, str) else None


def _validate_expression(expression: dict | None) -> None:
    sql = expression_sql(expression)
    if not sql or not sql.strip():
        raise FieldValidationError("A field needs an expression (its SQL fragment).")
    if any(tok in sql for tok in (";", "--", "/*", "*/")):
        raise FieldValidationError("The expression must be a single SQL fragment (no ';' or comments).")


async def pg_columns(db: AsyncSession, dataset: Dataset) -> list[dict[str, Any]]:
    """Live column metadata (name, ontology datatype, ordinal) from information_schema."""
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise FieldValidationError("Fields are only supported for PostgreSQL datasets.")
    if not is_valid_identifier(dataset.schema_name) or not is_valid_identifier(dataset.table_name):
        raise FieldValidationError("Invalid dataset table.")
    engine = pg_engine_for_datasource(ds)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT column_name, data_type, udt_name, ordinal_position "
                    "FROM information_schema.columns "
                    "WHERE table_schema = :s AND table_name = :t "
                    "ORDER BY ordinal_position"
                ),
                {"s": dataset.schema_name, "t": dataset.table_name},
            ).fetchall()
    finally:
        engine.dispose()
    out: list[dict[str, Any]] = []
    for r in rows:
        source_type = normalize_postgresql_column_type(str(r[1]), str(r[2] or ""))
        out.append(
            {
                "column_name": str(r[0]),
                "datatype": str(map_source_type_to_ontology(ds.kind, source_type)),
                "ordinal": int(r[3] or 0),
            }
        )
    return out


async def seed_fields(db: AsyncSession, dataset: Dataset, *, commit: bool = True) -> int:
    """Mirror physical columns into field rows (idempotent). Returns fields added."""
    cols = await pg_columns(db, dataset)
    existing = (
        await db.execute(select(DatasetField).where(DatasetField.dataset_id == dataset.id))
    ).scalars().all()
    by_column = {f.column_name: f for f in existing if f.column_name}
    added = 0
    for col in cols:
        field = by_column.get(col["column_name"])
        if field:
            field.datatype = col["datatype"]
            field.ordinal = col["ordinal"]
            if not field.expression:
                field.expression = column_expression(col["column_name"])
        else:
            db.add(
                DatasetField(
                    id=str(uuid.uuid4()),
                    dataset_id=dataset.id,
                    name=col["column_name"],
                    column_name=col["column_name"],
                    expression=column_expression(col["column_name"]),
                    datatype=col["datatype"],
                    ordinal=col["ordinal"],
                )
            )
            added += 1
    await db.flush()
    if commit:
        await db.commit()
    return added


async def list_fields(
    db: AsyncSession, dataset: Dataset, *, seed_if_empty: bool = True
) -> list[DatasetField]:
    """Fields for a dataset, seeded from columns on first read."""
    async def _query() -> list[DatasetField]:
        rows = (
            await db.execute(
                select(DatasetField)
                .where(DatasetField.dataset_id == dataset.id)
                .order_by(DatasetField.ordinal, DatasetField.name)
            )
        ).scalars().all()
        return list(rows)

    rows = await _query()
    if not rows and seed_if_empty:
        await seed_fields(db, dataset)
        rows = await _query()
    return rows


def validate_field(
    *,
    name: str | None,
    column_name: str | None,
    expression: dict | None,
    column_names: set[str],
) -> None:
    """Validate a field's name, source column, and expression."""
    clean_name = (name or "").strip()
    if not clean_name:
        raise FieldValidationError("A field needs a name.")
    if not _NAME.match(clean_name):
        raise FieldValidationError("Field names may contain letters, digits, spaces, '.', '-', '_'.")
    if column_name:
        if not is_valid_identifier(column_name) or column_name not in column_names:
            raise FieldValidationError(f"Column '{column_name}' not found in this dataset.")
    elif expression is None:
        raise FieldValidationError("A computed field needs an expression.")
    if expression is not None:
        _validate_expression(expression)
