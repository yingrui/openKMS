"""Semantic-model fields — the model-level semantic projection of dataset columns.

A field is a **column reference** or a **computed expression**, plus a `role`
(`dimension`) and `ai_context`. Fields are model-scoped and created explicitly (a
field marks a dimension / adds AI context — it is not a mirror of every column).
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


def validate_dimension(dimension: dict | None) -> None:
    """Ossie `Dimension` is **only** `{"is_time": boolean}`."""
    if dimension is None:
        return
    if not isinstance(dimension, dict) or not isinstance(dimension.get("is_time"), bool):
        raise FieldError("dimension must be {'is_time': boolean}.")
