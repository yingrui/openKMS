"""Validation for dataset relationships (Ossie foreign keys: `from` many → `to` one).

A relationship is authored manually and validated against live column metadata. The
`to` columns must be the target dataset's primary key or a declared unique key (when
one is declared).
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.services.ontology.dataset_tables import is_valid_identifier, pg_engine_for_datasource

JOIN_TYPES = ("left", "inner", "right", "full")


class JoinValidationError(ValueError):
    """Raised when a relationship is invalid; surfaced as HTTP 400."""


def _declared_keys(dataset: Dataset) -> list[set[str]]:
    """The primary key and unique keys declared on a dataset, as column-name sets."""
    keys: list[set[str]] = []
    if dataset.primary_key_columns:
        keys.append({str(c) for c in dataset.primary_key_columns})
    for uk in dataset.unique_keys or []:
        if uk:
            keys.append({str(c) for c in uk})
    return keys


async def _pg_columns(db: AsyncSession, dataset: Dataset) -> set[str]:
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise JoinValidationError("Relationships are only supported for PostgreSQL datasets.")
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
    from_dataset_id: str,
    to_dataset_id: str,
    from_columns: list[str],
    to_columns: list[str],
    join_type: str,
) -> tuple[Dataset, Dataset]:
    """Validate a relationship and return the (from, to) datasets."""
    if from_dataset_id == to_dataset_id:
        raise JoinValidationError("A relationship needs two different datasets.")
    if join_type not in JOIN_TYPES:
        raise JoinValidationError(f"join_type must be one of: {', '.join(JOIN_TYPES)}.")
    if not from_columns or not to_columns:
        raise JoinValidationError("At least one column pair is required.")
    if len(from_columns) != len(to_columns):
        raise JoinValidationError("from_columns and to_columns must have the same length.")

    frm = await db.get(Dataset, from_dataset_id)
    to = await db.get(Dataset, to_dataset_id)
    if not frm or not to:
        raise JoinValidationError("Dataset not found.")

    from_avail = await _pg_columns(db, frm)
    to_avail = await _pg_columns(db, to)
    for c in from_columns:
        if not is_valid_identifier(str(c)) or str(c) not in from_avail:
            raise JoinValidationError(f"Column '{c}' not found in the 'from' dataset.")
    for c in to_columns:
        if not is_valid_identifier(str(c)) or str(c) not in to_avail:
            raise JoinValidationError(f"Column '{c}' not found in the 'to' dataset.")
    declared = _declared_keys(to)
    if declared and {str(c) for c in to_columns} not in declared:
        raise JoinValidationError(
            "The 'to' columns must be the target dataset's primary key or a declared unique key."
        )
    return frm, to
