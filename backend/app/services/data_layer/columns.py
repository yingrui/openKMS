"""Dataset columns — live physical metadata + maintained annotations (description).

Columns themselves come from `information_schema` at read time; only the added
annotations (today: `description`) are stored, so nothing goes stale.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.dataset_column import DatasetColumn
from app.services.ontology.dataset_tables import is_valid_identifier, pg_engine_for_datasource
from app.services.ontology.property_types import (
    map_source_type_to_ontology,
    normalize_postgresql_column_type,
)


class ColumnError(ValueError):
    """Raised for invalid column operations; surfaced as HTTP 400."""


async def pg_columns(db: AsyncSession, dataset: Dataset) -> list[dict[str, Any]]:
    """Live column metadata (name, ontology type, nullable, ordinal) from information_schema."""
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise ColumnError("Columns are only supported for PostgreSQL datasets.")
    if not is_valid_identifier(dataset.schema_name) or not is_valid_identifier(dataset.table_name):
        raise ColumnError("Invalid dataset table.")
    engine = pg_engine_for_datasource(ds)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT column_name, data_type, udt_name, is_nullable, ordinal_position "
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
                "data_type": source_type,
                "ontology_type": str(map_source_type_to_ontology(ds.kind, source_type)),
                "is_nullable": r[3] == "YES",
                "ordinal": int(r[4] or 0),
            }
        )
    return out


async def description_map(db: AsyncSession, dataset_id: str) -> dict[str, str]:
    """column_name → description (only the ones with a stored description)."""
    rows = (
        await db.execute(select(DatasetColumn).where(DatasetColumn.dataset_id == dataset_id))
    ).scalars().all()
    return {r.column_name: r.description for r in rows if r.description}


async def set_description(
    db: AsyncSession,
    dataset: Dataset,
    column_name: str,
    description: str | None,
    *,
    sub: str | None = None,
    uname: str | None = None,
) -> None:
    if not is_valid_identifier(column_name):
        raise ColumnError("Invalid column name.")
    if column_name not in {c["column_name"] for c in await pg_columns(db, dataset)}:
        raise ColumnError(f"Column '{column_name}' not found.")
    row = (
        await db.execute(
            select(DatasetColumn).where(
                DatasetColumn.dataset_id == dataset.id,
                DatasetColumn.column_name == column_name,
            )
        )
    ).scalars().first()
    if row:
        row.description = description
    else:
        db.add(
            DatasetColumn(
                id=str(uuid.uuid4()),
                dataset_id=dataset.id,
                column_name=column_name,
                description=description,
                created_by=sub,
                created_by_name=uname,
            )
        )
    await db.commit()
