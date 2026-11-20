"""Semantic-model fields — the model-level semantic projection of dataset columns.

A field is a **column reference** or a **computed expression**, plus its dimension
role and `ai_context`. Fields are model-scoped and created explicitly (a field marks a
time dimension / adds AI context — it is not a mirror of every column).

**Dimension.** The spec defines `{"is_time": boolean}` and nothing else
(`additionalProperties: false`); when it is omitted the role follows `datatype`
(temporal ⇒ time dimension). No `granularity`/`timezone` — grain is a query-time concern
(and, if it must live in a model, a field whose expression is `DATE_TRUNC(...)`).
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.semantic_model import SemanticModel
from app.services.data.time_role import is_temporal_datatype as _is_temporal
from app.services.data.time_role import resolve_time_role
from app.models.semantic_model_field import SemanticModelField
from app.services.data.expressions import (
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


# The spec's `DataType` enum — the only values a field's/metric's `datatype` may take.
OSSIE_DATATYPES = (
    "String",
    "Integer",
    "Decimal",
    "Float",
    "Boolean",
    "Date",
    "Time",
    "DateTime",
    "DateTimeTz",
    "Opaque",
)


def validate_datatype(datatype: str | None) -> None:
    """`datatype` is optional, but when set it must be the spec's `DataType` enum."""
    if datatype is None or datatype == "":
        return
    if datatype not in OSSIE_DATATYPES:
        raise FieldError(f"datatype must be one of: {', '.join(OSSIE_DATATYPES)}.")


def is_temporal_datatype(datatype: str | None) -> bool:
    """Whether the datatype itself is a point in time — one input to the role, not the answer."""
    return _is_temporal(datatype)


def resolve_is_time(
    dimension: dict | None, datatype: str | None, time_format: str | None = None
) -> bool:
    """The effective time-dimension role, from **three** inputs: the field's override, the datatype and the
    column's `time_format`.

    This is a delegate on purpose. The role used to be decided here from the datatype alone, while the
    dataset's columns were decided from `time_format` too — so a text column holding weeks (`%G-W%V`) was a
    time dimension on the columns page and not one here, and a metric could not name it as its period.
    One question, one implementation (`services/data/time_role.py`).
    """
    return resolve_time_role(
        datatype=datatype, time_format=time_format, field_dimension=dimension
    )[0]


def validate_dimension(dimension: dict | None) -> None:
    """Ossie `Dimension`: `additionalProperties: false` and **no required keys** — so an absent `dimension`
    *or* `dimension: {}` is valid; both mean "`is_time` not declared" and the role then follows the column.

    Writing the calendar here is refused on purpose. It lives on the column (`time_format`) and is derived
    from it; a second place to write it is a second answer to the same question. The keys that used to be
    accepted (`period_kind`, `period_format`) are gone — no row carries them.
    """
    if dimension is None:
        return
    if not isinstance(dimension, dict):
        raise FieldError("dimension must be an object.")
    unknown = set(dimension) - {"is_time"}
    if unknown:
        raise FieldError(
            f"dimension has unknown keys: {', '.join(sorted(unknown))} — the calendar is the column's "
            "`time_format`, not a field property."
        )
    if "is_time" in dimension and not isinstance(dimension["is_time"], bool):
        raise FieldError("dimension.is_time must be a boolean.")
