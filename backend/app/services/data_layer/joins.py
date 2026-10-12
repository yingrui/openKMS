"""Validation + helpers for dataset joins (the data-engineering ER model).

A join is a **registered equi-join** between two PostgreSQL-backed datasets. It is
authored manually (no auto-discovery) and validated against live column metadata.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.services.ontology.dataset_tables import is_valid_identifier, pg_engine_for_datasource

CARDINALITIES = ("one-to-one", "one-to-many")


class JoinValidationError(ValueError):
    """Raised when a join definition is invalid; surfaced as HTTP 400."""


async def _pg_columns(db: AsyncSession, dataset: Dataset) -> set[str]:
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise JoinValidationError("Joins are only supported for PostgreSQL datasets.")
    if not is_valid_identifier(dataset.schema_name) or not is_valid_identifier(dataset.table_name):
        raise JoinValidationError("Invalid dataset table.")
    engine = pg_engine_for_datasource(ds)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = :s AND table_name = :t"
                ),
                {"s": dataset.schema_name, "t": dataset.table_name},
            ).fetchall()
        return {str(r[0]) for r in rows}
    finally:
        engine.dispose()


async def validate_join(
    db: AsyncSession,
    *,
    source_dataset_id: str,
    target_dataset_id: str,
    cardinality: str,
    join_columns: list[dict[str, Any]],
) -> tuple[Dataset, Dataset]:
    """Validate a join and return (source, target) datasets. Raises JoinValidationError."""
    if source_dataset_id == target_dataset_id:
        raise JoinValidationError("A join needs two different datasets.")
    if cardinality not in CARDINALITIES:
        raise JoinValidationError(f"Cardinality must be one of: {', '.join(CARDINALITIES)}.")
    if not join_columns:
        raise JoinValidationError("At least one column pair is required.")

    source = await db.get(Dataset, source_dataset_id)
    target = await db.get(Dataset, target_dataset_id)
    if not source or not target:
        raise JoinValidationError("Dataset not found.")

    source_cols = await _pg_columns(db, source)
    target_cols = await _pg_columns(db, target)
    for pair in join_columns:
        s = str(pair.get("source", "")).strip()
        t = str(pair.get("target", "")).strip()
        if not (is_valid_identifier(s) and is_valid_identifier(t)):
            raise JoinValidationError(f"Invalid column name in pair '{s}={t}'.")
        if s not in source_cols:
            raise JoinValidationError(f"Column '{s}' not found in the source dataset.")
        if t not in target_cols:
            raise JoinValidationError(f"Column '{t}' not found in the target dataset.")
    return source, target
