"""Ad-hoc preview of a semantic model — a metric grouped by its dimensions.

This is the **"try it"** surface (not a saved artifact): the metric's expression is
wrapped into a generated query, grouped by fields the model marked as dimensions
(Ossie `dimension` roles). Time dimensions aggregate with `date_trunc`.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.metric_definition import MetricDefinition
from app.models.semantic_model_field import SemanticModelField
from app.services.data_layer.expressions import ANSI, dialect_sql
from app.services.data_layer.metrics import (
    DEFAULT_ROW_CAP,
    DEFAULT_TIMEOUT_MS,
    metric_expression_sql,
    resolve_joins,
)
from app.services.data_layer.sql_build import SqlBuildError, build_joins_sql, build_where
from app.services.data_layer.sql_runner import run_readonly


class PreviewError(ValueError):
    """Raised when a preview cannot run; surfaced as HTTP 400."""


def _dimension_expr(field: SemanticModelField, granularity: str | None) -> str:
    expr = dialect_sql(field.expression, ANSI)
    if not expr:
        raise PreviewError(f"Field '{field.name}' has no expression.")
    if (field.dimension or {}).get("is_time"):
        g = granularity or "day"
        if g not in ("second", "minute", "hour", "day", "week", "month", "quarter", "year"):
            g = "day"
        return f"date_trunc('{g}', {expr})"
    return expr


async def run_preview(
    db: AsyncSession,
    *,
    metric: MetricDefinition,
    group_by: list[str],
    granularity: str | None = None,
    filters: list[dict[str, Any]] | None = None,
    row_cap: int = DEFAULT_ROW_CAP,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
) -> tuple[str, list[str], list[dict[str, Any]]]:
    """Run a metric grouped by dimensions; returns ``(sql, columns, rows)``."""
    base = await db.get(Dataset, metric.base_dataset_id)
    if not base:
        raise PreviewError("Base dataset not found.")
    ds = await db.get(DataSource, base.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise PreviewError("Preview only runs on PostgreSQL datasets.")

    metric_expr = metric_expression_sql(metric.expression)
    if not metric_expr:
        raise PreviewError("The metric has no expression.")

    dim_exprs: list[str] = []
    dim_selects: list[str] = []
    columns: list[str] = []
    if group_by:
        rows = (
            await db.execute(
                select(SemanticModelField).where(SemanticModelField.id.in_(group_by))
            )
        ).scalars().all()
        by_id = {f.id: f for f in rows}
        for field_id in group_by:
            field = by_id.get(field_id)
            if not field:
                raise PreviewError(f"Field '{field_id}' not found.")
            if field.dataset_id != base.id:
                raise PreviewError(
                    f"Dimension '{field.name}' is not on the metric's base dataset."
                )
            expr = _dimension_expr(field, granularity)
            dim_exprs.append(expr)
            dim_selects.append(f'{expr} AS "{field.name}"')
            columns.append(field.name)

    joins_by_id, datasets_by_id = await resolve_joins(db, base, metric.joins)
    try:
        joins_sql = build_joins_sql(
            base,
            list(metric.joins or []),
            joins_by_id=joins_by_id,
            datasets_by_id=datasets_by_id,
        )
        where, params = build_where([*(metric.filters or []), *(filters or [])])
    except SqlBuildError as exc:
        raise PreviewError(str(exc)) from exc

    select_list = [*dim_selects, f'({metric_expr}) AS "value"']
    sql = (
        f'SELECT {", ".join(select_list)} '
        f'FROM "{base.schema_name}"."{base.table_name}" base'
    )
    if joins_sql:
        sql += " " + " ".join(joins_sql)
    if where:
        sql += " WHERE " + " AND ".join(where)
    if dim_exprs:
        sql += " GROUP BY " + ", ".join(dim_exprs)
    sql += f" LIMIT {int(row_cap)}"

    try:
        result_rows = run_readonly(ds, sql, params, timeout_ms=timeout_ms)
    except Exception as exc:  # noqa: BLE001 - surface any DB error as a preview error
        raise PreviewError(f"Preview query failed: {exc}") from exc
    return sql, [*columns, "value"], result_rows
