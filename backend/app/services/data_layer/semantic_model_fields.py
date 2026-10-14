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


DIMENSION_TYPES = ("time", "categorical")
GRANULARITIES = ("second", "minute", "hour", "day", "week", "month", "quarter", "year")
ENTITY_TYPES = ("foreign", "primary")


def validate_dimension(dimension: dict | None) -> None:
    """Ossie dimension role: `{"type": "time"|"categorical", "granularity"?, "timezone"?}`."""
    if dimension is None:
        return
    if not isinstance(dimension, dict) or dimension.get("type") not in DIMENSION_TYPES:
        raise FieldError(f"dimension.type must be one of: {', '.join(DIMENSION_TYPES)}.")
    granularity = dimension.get("granularity")
    if granularity is not None and granularity not in GRANULARITIES:
        raise FieldError(f"dimension.granularity must be one of: {', '.join(GRANULARITIES)}.")


def validate_entity(entity: dict | None) -> None:
    """Ossie entity: `{"type": "foreign"|"primary", "name": …}`."""
    if entity is None:
        return
    if not isinstance(entity, dict) or entity.get("type") not in ENTITY_TYPES:
        raise FieldError(f"entity.type must be one of: {', '.join(ENTITY_TYPES)}.")
    if not str(entity.get("name") or "").strip():
        raise FieldError("entity.name is required.")
