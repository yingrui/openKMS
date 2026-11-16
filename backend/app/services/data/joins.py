"""Validation for dataset relationships (Ossie foreign keys: `from` many → `to` one).

A relationship is authored manually and validated against live column metadata. The
`to` columns must be the target dataset's primary key or a declared unique key. When the
target declares nothing, uniqueness is checked against its profile instead — a join that
matches several target rows multiplies every metric built on it. Optionality (`required`)
is the only other query-ish flag an edge keeps.
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.dataset_profile import DatasetProfile
from app.services.data.columns import cached_column_names
from app.services.ontology.dataset_tables import is_valid_identifier


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
    names = await asyncio.to_thread(
        cached_column_names, ds, dataset.schema_name, dataset.table_name
    )
    return set(names)


async def validate_join(
    db: AsyncSession,
    *,
    from_dataset_id: str,
    to_dataset_id: str,
    from_columns: list[str],
    to_columns: list[str],
) -> tuple[Dataset, Dataset]:
    """Validate a relationship and return the (from, to) datasets."""
    if from_dataset_id == to_dataset_id:
        raise JoinValidationError("A relationship needs two different datasets.")
    if not from_columns or not to_columns:
        raise JoinValidationError("At least one column pair is required.")
    if len(from_columns) != len(to_columns):
        raise JoinValidationError("from_columns and to_columns must have the same length.")

    frm = await db.get(Dataset, from_dataset_id)
    to = await db.get(Dataset, to_dataset_id)
    if not frm or not to:
        raise JoinValidationError("Dataset not found.")
    for dataset in (frm, to):
        if (dataset.kind or "table") == "file":
            # Reading a file dataset is column/row selection, not SQL — a relationship would have
            # nothing to execute it with.
            raise JoinValidationError(
                "A file dataset cannot take part in a relationship: relationships are joins, and "
                "file datasets support column and row selection only."
            )

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
    if not declared:
        # Nothing declared, so uniqueness can only come from the data. A join that matches several target
        # rows multiplies the rows of every metric built on it, silently — which is why this is a refusal
        # and not a warning.
        await _require_unique_target(db, to, [str(c) for c in to_columns])
    return frm, to


def _target_label(dataset: Dataset) -> str:
    """`datasets` rows carry a label, not a name; the message has to point at something a reader recognises."""
    for attr in ("display_name", "table_name", "id"):
        value = getattr(dataset, attr, None)
        if isinstance(value, str) and value.strip():
            return value
    return dataset.id


async def _require_unique_target(db: AsyncSession, target: Dataset, to_columns: list[str]) -> None:
    """Refuse a join whose 'to' columns are not unique in the target dataset's profile."""
    if len(to_columns) > 1:
        raise JoinValidationError(
            "The 'to' dataset declares no primary or unique key, so a composite relationship cannot be "
            "checked: declare the key on the dataset first."
        )
    profile = (
        await db.execute(select(DatasetProfile).where(DatasetProfile.dataset_id == target.id))
    ).scalar_one_or_none()
    if profile is None or profile.computed_at is None:
        raise JoinValidationError(
            f"'{_target_label(target)}' declares no primary or unique key, so uniqueness has to be checked "
            "against the data — refresh the dataset's statistics first."
        )
    column = to_columns[0]
    stats = next(
        (entry for entry in (profile.column_stats or []) if entry.get("column") == column),
        None,
    )
    if not stats or stats.get("distinct_count") is None or profile.row_count is None:
        raise JoinValidationError(
            f"'{_target_label(target)}.{column}' has no statistics yet — refresh the dataset's statistics first."
        )
    # `count(distinct)` ignores NULLs and a NULL never matches, so duplicates are the only denominator.
    non_null_rows = profile.row_count - int(stats.get("null_count") or 0)
    if int(stats["distinct_count"]) != non_null_rows:
        raise JoinValidationError(
            f"'{_target_label(target)}.{column}' is not unique: {stats['distinct_count']} distinct values for "
            f"{non_null_rows} non-null rows, so this relationship would multiply rows. Use a column that is "
            "unique, or declare it as a key."
        )
