"""Ad-hoc query of a semantic model — the Playground's engine (and the agent's).

One query shape, shared by the UI and the API: a **metric** over **group-by fields**
(each optionally with a query-time grain), **filters** on the model's fields, an
**order** and a **limit**. Read-only, with a statement timeout and a row cap, and every
run is audited. A query with no grouping is the metric's single value.
"""
from __future__ import annotations

from typing import Any

import time

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
    MetricError,
    resolve_joins,
    validate_metric_definition,
)
from app.services.data_layer.semantic_model_fields import resolve_is_time
from app.services.data_layer.sql_build import (
    SqlBuildError,
    build_conditions,
    build_joins_sql,
)
from app.services.data_layer.sql_runner import run_readonly
from app.services.ontology.dataset_tables import is_valid_identifier

_BASE_ALIAS = "base"
GRANULARITIES = ("second", "minute", "hour", "day", "week", "month", "quarter", "year")
DEFAULT_LIMIT = 100


def _quote(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


class QueryError(ValueError):
    """Raised when a query cannot run; surfaced as HTTP 400."""


def field_sql(field: SemanticModelField) -> str:
    """A field's SQL, **qualified with the base alias** so a join onto another dataset
    that shares the column name (e.g. ``ts_code``) stays unambiguous."""
    if field.column_name:
        if not is_valid_identifier(field.column_name):
            raise QueryError(f"Field '{field.name}' has an invalid column.")
        return f"{_BASE_ALIAS}.{_quote(field.column_name)}"
    expr = dialect_sql(field.expression, ANSI)
    if not expr:
        raise QueryError(f"Field '{field.name}' has no expression.")
    return expr


def dimension_sql(field: SemanticModelField, granularity: str | None) -> str:
    """A field used as a group-by dimension; a time dimension is truncated to its grain."""
    expr = field_sql(field)
    if not resolve_is_time(field.dimension, field.datatype):
        return expr
    grain = granularity if granularity in GRANULARITIES else "day"
    return f"date_trunc('{grain}', {expr})"


def build_sql(
    base: Dataset,
    *,
    metric_expr: str,
    dimensions: list[tuple[str, str]],
    joins_sql: list[str],
    where: list[str],
    order_by: list[str],
    limit: int,
) -> str:
    """Compose the statement: ``SELECT <dims>, (<metric>) AS value … [ORDER BY] LIMIT n``."""
    select = [f'{expr} AS {_quote(alias)}' for expr, alias in dimensions]
    select.append(f'({metric_expr}) AS "value"')
    sql = f'SELECT {", ".join(select)} FROM "{base.schema_name}"."{base.table_name}" base'
    if joins_sql:
        sql += " " + " ".join(joins_sql)
    if where:
        sql += " WHERE " + " AND ".join(where)
    if dimensions:
        sql += " GROUP BY " + ", ".join(expr for expr, _ in dimensions)
    if order_by:
        sql += " ORDER BY " + ", ".join(order_by)
    return f"{sql} LIMIT {int(limit)}"


def _order_sql(ref: str, direction: str, value_expr: str, dims: dict[str, str]) -> str:
    """Order by the metric (`value`) or by a grouped dimension, never by raw SQL."""
    if direction not in ("asc", "desc"):
        raise QueryError("Order direction must be 'asc' or 'desc'.")
    # NULLS LAST either way: an empty group should never top the list.
    if ref == "value":
        return f"({value_expr}) {direction.upper()} NULLS LAST"
    if ref not in dims:
        raise QueryError(f"Cannot order by '{ref}': group by it first.")
    return f"{dims[ref]} {direction.upper()} NULLS LAST"


async def _load_metric(
    db: AsyncSession, model_id: str, ref: str
) -> MetricDefinition:
    """A metric of this model, addressed by id **or** name (agents prefer names)."""
    rows = (
        await db.execute(
            select(MetricDefinition).where(MetricDefinition.semantic_model_id == model_id)
        )
    ).scalars().all()
    for m in rows:
        if m.id == ref or m.name == ref:
            return m
    raise QueryError(f"Metric '{ref}' not found in this model.")


async def run_query(
    db: AsyncSession,
    *,
    model_id: str,
    metric: str,
    group_by: list[dict[str, Any]] | None = None,
    filters: list[dict[str, Any]] | None = None,
    order_by: list[dict[str, Any]] | None = None,
    limit: int | None = None,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
) -> tuple[str, list[str], list[dict[str, Any]], bool, int]:
    """Run one query of a semantic model.

    ``group_by`` entries are ``{"field": <id|name>, "granularity": <grain|null>}``;
    ``filters`` are ``{"field": <id|name>, "op": …, "value": …}`` (the metric's own
    filters are always applied); ``order_by`` entries are ``{"field": "value"|<grouped
    field ref>, "direction": "asc"|"desc"}``.

    Returns ``(sql, columns, rows, capped, duration_ms)`` — ``capped`` means the limit
    was reached, i.e. the answer is not the whole truth.
    """
    definition = await _load_metric(db, model_id, metric)
    base = await db.get(Dataset, definition.base_dataset_id)
    if not base:
        raise QueryError("Base dataset not found.")
    ds = await db.get(DataSource, base.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise QueryError("Queries only run on PostgreSQL datasets.")

    try:
        metric_expr = validate_metric_definition(
            name=definition.name, type=definition.type, expression=definition.expression
        )
    except MetricError as exc:
        raise QueryError(str(exc)) from exc

    # Fields are addressed by id or name and must belong to the metric's dataset.
    field_rows = (
        await db.execute(
            select(SemanticModelField).where(
                SemanticModelField.semantic_model_id == model_id,
                SemanticModelField.dataset_id == base.id,
            )
        )
    ).scalars().all()
    by_id = {f.id: f for f in field_rows}
    by_name = {f.name: f for f in field_rows}

    def resolve(ref: Any) -> SemanticModelField:
        if not isinstance(ref, str):
            raise QueryError("A field reference must be a string.")
        field = by_id.get(ref) or by_name.get(ref)
        if not field:
            raise QueryError(f"Field '{ref}' is not a field of this metric's dataset.")
        return field

    dimensions: list[tuple[str, str]] = []
    dims_by_name: dict[str, str] = {}
    for entry in group_by or []:
        ref = entry.get("field") if isinstance(entry, dict) else entry
        field = resolve(ref)
        expr = dimension_sql(field, entry.get("granularity") if isinstance(entry, dict) else None)
        dimensions.append((expr, field.name))
        dims_by_name[field.name] = expr

    conditions: list[tuple[str, str, Any]] = [
        (f'{_BASE_ALIAS}.{_quote(str(f.get("column")))}', str(f.get("op")), f.get("value"))
        for f in (definition.filters or [])
        if isinstance(f.get("column"), str) and is_valid_identifier(f["column"])
    ]
    for f in filters or []:
        conditions.append((field_sql(resolve(f.get("field"))), str(f.get("op")), f.get("value")))

    capped_limit = min(max(1, int(limit or DEFAULT_LIMIT)), DEFAULT_ROW_CAP)
    joins_by_id, datasets_by_id = await resolve_joins(db, base, definition.joins)
    try:
        joins_sql = build_joins_sql(
            base,
            list(definition.joins or []),
            joins_by_id=joins_by_id,
            datasets_by_id=datasets_by_id,
        )
        where, params = build_conditions(conditions)
    except SqlBuildError as exc:
        raise QueryError(str(exc)) from exc

    order = [
        _order_sql(str(o.get("field")), str(o.get("direction") or "asc"), metric_expr, dims_by_name)
        for o in (order_by or [])
        if isinstance(o, dict)
    ]
    # Fetch one extra row so we can tell "exactly the limit" from "there is more".
    sql = build_sql(
        base,
        metric_expr=metric_expr,
        dimensions=dimensions,
        joins_sql=joins_sql,
        where=where,
        order_by=order,
        limit=capped_limit + 1,
    )

    started = time.perf_counter()
    try:
        rows = run_readonly(ds, sql, params, timeout_ms=timeout_ms)
    except Exception as exc:  # noqa: BLE001 - surface any DB error as a query error
        raise QueryError(f"Query failed: {exc}") from exc
    duration_ms = int((time.perf_counter() - started) * 1000)

    capped = len(rows) > capped_limit
    rows = rows[:capped_limit]
    columns = [*[name for _, name in dimensions], "value"]
    return sql, columns, rows, capped, duration_ms
