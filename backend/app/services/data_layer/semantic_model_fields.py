"""Semantic-model fields — the model-level semantic projection of dataset columns.

A field is a **column reference** or a **computed expression**, plus its dimension
role and `ai_context`. Fields are model-scoped and created explicitly (a field marks a
time dimension / adds AI context — it is not a mirror of every column).

**Dimension.** The core spec only defines `{"is_time": boolean}`. We additionally keep
`granularity` (a time dimension's default drill-down grain, also chosen per query in
Try) *inside* our stored dimension; it is stripped on export and round-trips through the
`OPENKMS` custom extension, so the emitted document stays spec-exact.
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.semantic_model import SemanticModel
from app.models.semantic_model_field import SemanticModelField
from app.services.data_layer.expressions import (
    ANSI,
    dialect_sql,
    make_expression,
    validate_fragment,
)
_NAME = re.compile(r"^[\w][\w .\-]*$")


class FieldError(ValueError):
    """Raised when a field is invalid; surfaced as HTTP 400."""


def column_expression(column: str) -> dict[str, Any]:
    """The dialect expression for a plain column reference."""
    return make_expression(f'"{column}"')


def expression_sql(expression: dict | None) -> str | None:
    """The ANSI_SQL fragment of an Ossie expression, if any."""
    return dialect_sql(expression, ANSI)


def _validate_expression(expression: dict | None) -> None:
    try:
        validate_fragment(expression_sql(expression))
    except ValueError as exc:
        raise FieldError(str(exc)) from exc


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
        raise FieldError("A field needs a name.")
    if not _NAME.match(clean_name):
        raise FieldError("Field names may contain letters, digits, spaces, '.', '-', '_'.")
    if column_name:
        if column_name not in column_names:
            raise FieldError(f"Column '{column_name}' not found in this dataset.")
    elif expression is None:
        raise FieldError("A computed field needs an expression.")
    if expression is not None:
        _validate_expression(expression)


async def list_fields(db: AsyncSession, model: SemanticModel) -> list[SemanticModelField]:
    """Fields for a model (model-scoped, created explicitly — no auto-seed)."""
    rows = (
        await db.execute(
            select(SemanticModelField)
            .where(SemanticModelField.semantic_model_id == model.id)
            .order_by(SemanticModelField.dataset_id, SemanticModelField.ordinal, SemanticModelField.name)
        )
    ).scalars().all()
    return list(rows)


_TEMPORAL_DATATYPES = {"date", "time", "datetime", "datetimetz", "timestamp", "timestamptz"}
GRANULARITIES = ("second", "minute", "hour", "day", "week", "month", "quarter", "year")
DIMENSION_KEYS = ("is_time", "granularity")


def is_temporal_datatype(datatype: str | None) -> bool:
    return (datatype or "").strip().lower() in _TEMPORAL_DATATYPES


def resolve_is_time(dimension: dict | None, datatype: str | None) -> bool:
    """The effective Ossie time-dimension role: an explicit `dimension.is_time`
    always wins; otherwise it defaults to `true` for a temporal `datatype`
    (`Date`/`Time`/`DateTime`/`DateTimeTz`, or our internal `datetime`) and
    `false` otherwise — so a temporal column is opted *out* with `{"is_time": false}`."""
    if isinstance(dimension, dict) and isinstance(dimension.get("is_time"), bool):
        return bool(dimension["is_time"])
    return is_temporal_datatype(datatype)


def dimension_granularity(dimension: dict | None) -> str | None:
    """Our time-dimension grain extension, if set."""
    grain = dimension.get("granularity") if isinstance(dimension, dict) else None
    return grain if grain in GRANULARITIES else None


def ossie_dimension(dimension: dict | None) -> dict | None:
    """The core-spec `Dimension` — only `is_time`; our `granularity` is dropped."""
    if isinstance(dimension, dict) and isinstance(dimension.get("is_time"), bool):
        return {"is_time": dimension["is_time"]}
    return None


def validate_dimension(dimension: dict | None) -> None:
    """Ossie `Dimension` is `{"is_time": boolean}`; we additionally allow our
    `granularity` (only meaningful on a time dimension)."""
    if dimension is None:
        return
    if not isinstance(dimension, dict) or not isinstance(dimension.get("is_time"), bool):
        raise FieldError("dimension must be {'is_time': boolean, 'granularity'?: ...}.")
    unknown = set(dimension) - set(DIMENSION_KEYS)
    if unknown:
        raise FieldError(f"dimension has unknown keys: {', '.join(sorted(unknown))}.")
    grain = dimension.get("granularity")
    if grain is None:
        return
    if grain not in GRANULARITIES:
        raise FieldError(f"granularity must be one of: {', '.join(GRANULARITIES)}.")
    if not dimension.get("is_time"):
        raise FieldError("granularity is only valid on a time dimension (is_time: true).")
