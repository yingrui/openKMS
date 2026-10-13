"""Semantic-model fields — the model-level semantic projection of dataset columns.

A field is a **column reference** or a **computed expression**, plus a `role`
(`dimension`) and `ai_context`. Fields are model-scoped and seeded from the columns
of the datasets in the model's scope.
"""
from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset
from app.models.semantic_model import SemanticModel
from app.models.semantic_model_field import SemanticModelField
from app.services.data_layer.columns import pg_columns

ANSI = "ANSI_SQL"
_NAME = re.compile(r"^[\w][\w .\-]*$")


class FieldError(ValueError):
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
        raise FieldError("A field needs an expression (its SQL fragment).")
    if any(tok in sql for tok in (";", "--", "/*", "*/")):
        raise FieldError("The expression must be a single SQL fragment (no ';' or comments).")


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


async def seed_fields(db: AsyncSession, model_id: str, dataset: Dataset) -> int:
    """Mirror a dataset's columns into model fields (idempotent). Returns fields added."""
    cols = await pg_columns(db, dataset)
    existing = (
        await db.execute(
            select(SemanticModelField).where(
                SemanticModelField.semantic_model_id == model_id,
                SemanticModelField.dataset_id == dataset.id,
            )
        )
    ).scalars().all()
    by_column = {f.column_name: f for f in existing if f.column_name}
    added = 0
    for col in cols:
        field = by_column.get(col["column_name"])
        if field:
            field.datatype = col["ontology_type"]
            field.ordinal = col["ordinal"]
            if not field.expression:
                field.expression = column_expression(col["column_name"])
        else:
            db.add(
                SemanticModelField(
                    id=str(uuid.uuid4()),
                    semantic_model_id=model_id,
                    dataset_id=dataset.id,
                    name=col["column_name"],
                    column_name=col["column_name"],
                    expression=column_expression(col["column_name"]),
                    datatype=col["ontology_type"],
                    ordinal=col["ordinal"],
                )
            )
            added += 1
    await db.flush()
    return added


async def seed_model_fields(db: AsyncSession, model: SemanticModel) -> int:
    """Seed fields for every dataset in the model's scope (idempotent)."""
    from app.services.data_layer.semantic_models import member_ids

    added = 0
    for dataset_id in await member_ids(db, model.id):
        dataset = await db.get(Dataset, dataset_id)
        if dataset:
            added += await seed_fields(db, model.id, dataset)
    if added:
        await db.commit()
    return added


async def list_fields(db: AsyncSession, model: SemanticModel) -> list[SemanticModelField]:
    """Fields for a model, seeded from its datasets' columns on first read."""
    async def _query() -> list[SemanticModelField]:
        rows = (
            await db.execute(
                select(SemanticModelField)
                .where(SemanticModelField.semantic_model_id == model.id)
                .order_by(SemanticModelField.ordinal, SemanticModelField.name)
            )
        ).scalars().all()
        return list(rows)

    rows = await _query()
    if not rows:
        await seed_model_fields(db, model)
        rows = await _query()
    return rows
