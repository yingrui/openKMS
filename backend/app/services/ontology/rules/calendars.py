"""A model field's calendar, read from the one place that knows it.

The calendar comes from the **column's** `time_format` (`dataset_columns.time_format`), with the field's
override and the old `period_kind` as fallbacks. Every caller that needs "which interval does this period
label" goes through here, so a text column holding `%G-W%V` is a week for the evaluator, the run-parameter
descriptor and the rule validator alike.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset_column import DatasetColumn
from app.models.semantic_model_field import SemanticModelField
from app.services.ontology.rules.periods import kind_of_dimension


async def column_time_format(db: AsyncSession, field: SemanticModelField | None) -> str | None:
    if field is None or not field.column_name:
        return None
    return (
        await db.execute(
            select(DatasetColumn.time_format).where(
                DatasetColumn.dataset_id == field.dataset_id,
                DatasetColumn.column_name == field.column_name,
            )
        )
    ).scalar_one_or_none()


async def field_calendar(db: AsyncSession, field: SemanticModelField | None) -> str:
    """`day` / `week` / … , or `custom` when nothing in the value names an interval."""
    if field is None:
        return "custom"
    return kind_of_dimension(
        field.dimension, field.datatype, await column_time_format(db, field)
    )
