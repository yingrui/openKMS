"""Run a saved query — metrics + group-by fields + filter over a base dataset.

A saved query is a model-level Ossie ``saved_query``: it pins metrics (references to
model metrics), ``group_by`` fields (dimension fields on the base dataset), a filter,
and joins. The SQL is generated here and executed **read-only** with a statement
timeout + row cap. ``build_query_sql`` is pure (no DB) and unit-tested.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.dataset_field import DatasetField
from app.models.dataset_join import DatasetJoin
from app.models.metric_definition import MetricDefinition
from app.models.saved_query import SavedQuery
from app.services.data_layer.fields import expression_sql as field_expression_sql
from app.services.data_layer.metrics import (
    DEFAULT_ROW_CAP,
    DEFAULT_TIMEOUT_MS,
    metric_expression_sql,
    resolve_joins,
)
from app.services.data_layer.sql_build import SqlBuildError, build_joins_sql, build_where
from app.services.data_layer.sql_runner import run_readonly
from app.services.ontology.dataset_tables import is_valid_identifier


class QueryError(ValueError):
    """Raised when a saved query cannot run; surfaced as HTTP 400."""


def _alias(name: Any) -> str:
    if not isinstance(name, str) or not name.strip() or '"' in name:
        raise QueryError("Invalid output column name.")
    return name.strip()


def build_query_sql(
    base_dataset: Dataset,
    query: SavedQuery,
    *,
    fields_by_name: dict[str, DatasetField],
    metrics_by_id: dict[str, MetricDefinition],
    joins_by_id: dict[str, DatasetJoin],
    datasets_by_id: dict[str, Dataset],
    row_cap: int = DEFAULT_ROW_CAP,
) -> tuple[str, list[str], dict[str, Any]]:
    """Build ``(sql, columns, params)`` for a saved query. Raises :class:`QueryError`."""
    if not (
        is_valid_identifier(base_dataset.schema_name) and is_valid_identifier(base_dataset.table_name)
    ):
        raise QueryError("Invalid dataset table.")

    select_exprs: list[str] = []
    group_exprs: list[str] = []
    columns: list[str] = []

    for field_name in query.group_by or []:
        field = fields_by_name.get(field_name)
        if not field:
            raise QueryError(f"Field '{field_name}' not found on the base dataset.")
        expr = field_expression_sql(field.expression)
        if not expr:
            raise QueryError(f"Field '{field_name}' has no expression.")
        alias = _alias(field_name)
        select_exprs.append(f'{expr} AS "{alias}"')
        group_exprs.append(expr)
        columns.append(alias)

    for spec in query.metrics or []:
        spec = spec if isinstance(spec, dict) else {}
        alias = _alias(spec.get("name") or "")
        metric_id = spec.get("metric_id")
        metric = metrics_by_id.get(metric_id)
        if not metric:
            raise QueryError(f"Metric '{metric_id}' not found.")
        expr = metric_expression_sql(metric.expression)
        if not expr:
            raise QueryError(f"Metric '{alias}' has no expression.")
        select_exprs.append(f'({expr}) AS "{alias}"')
        columns.append(alias)

    if not select_exprs:
        raise QueryError("A saved query needs at least one metric or field.")

    try:
        joins_sql = build_joins_sql(
            base_dataset,
            list(query.joins or []),
            joins_by_id=joins_by_id,
            datasets_by_id=datasets_by_id,
        )
        where, params = build_where(query.filters)
    except SqlBuildError as exc:
        raise QueryError(str(exc)) from exc

    sql = (
        f'SELECT {", ".join(select_exprs)} '
        f'FROM "{base_dataset.schema_name}"."{base_dataset.table_name}" base'
    )
    if joins_sql:
        sql += " " + " ".join(joins_sql)
    if where:
        sql += " WHERE " + " AND ".join(where)
    if group_exprs:
        sql += " GROUP BY " + ", ".join(group_exprs)
    sql += f" LIMIT {int(row_cap)}"
    return sql, columns, params


async def run_saved_query(
    db: AsyncSession,
    query: SavedQuery,
    *,
    row_cap: int = DEFAULT_ROW_CAP,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
) -> tuple[list[str], list[dict[str, Any]]]:
    """Run a saved query read-only (timeout + row cap); returns ``(columns, rows)``."""
    base = await db.get(Dataset, query.base_dataset_id)
    if not base:
        raise QueryError("Base dataset not found.")
    ds = await db.get(DataSource, base.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise QueryError("Saved queries only run on PostgreSQL datasets.")

    fields = (
        await db.execute(select(DatasetField).where(DatasetField.dataset_id == base.id))
    ).scalars().all()
    fields_by_name = {f.name: f for f in fields}

    metrics_by_id: dict[str, MetricDefinition] = {}
    for spec in query.metrics or []:
        metric_id = spec.get("metric_id") if isinstance(spec, dict) else None
        if metric_id and metric_id not in metrics_by_id:
            metric = await db.get(MetricDefinition, metric_id)
            if metric:
                metrics_by_id[metric_id] = metric

    joins_by_id, datasets_by_id = await resolve_joins(db, base, query.joins)
    sql, columns, params = build_query_sql(
        base,
        query,
        fields_by_name=fields_by_name,
        metrics_by_id=metrics_by_id,
        joins_by_id=joins_by_id,
        datasets_by_id=datasets_by_id,
        row_cap=row_cap,
    )

    try:
        rows = run_readonly(ds, sql, params, timeout_ms=timeout_ms)
    except Exception as exc:  # noqa: BLE001 - surface any DB error as a query error
        raise QueryError(f"Query failed: {exc}") from exc
    return columns, rows
