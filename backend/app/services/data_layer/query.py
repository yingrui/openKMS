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
from sqlalchemy.exc import SQLAlchemyError
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
from app.services.data_layer.query_errors import (
    DATA,
    DEFINITION,
    REQUEST,
    QueryFailure,
    QueryFailureKind,
    classify_sql_error,
)
from app.services.data_layer.sql_build import (
    SqlBuildError,
    join_dataset_aliases,
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
    """Raised when a query cannot run.

    The API layer turns it into a localized 400: `failure.code` is a stable code from
    `app/i18n/catalog.py`, `failure.kind` says who has to fix it (definition / data / request)
    and `failure.detail` carries the raw source text for the details line.
    """

    def __init__(self, message: str, failure: QueryFailure | None = None) -> None:
        super().__init__(message)
        self.failure = failure or QueryFailure("QUERY_FAILED", DATA)

    @property
    def code(self) -> str:
        return self.failure.code

    @property
    def kind(self) -> QueryFailureKind:
        return self.failure.kind

    @property
    def detail(self) -> str | None:
        return self.failure.detail


def field_sql(field: SemanticModelField, alias: str = _BASE_ALIAS) -> str:
    """A field's SQL, qualified with **its dataset's alias**.

    ``base`` by default; a field of a dataset the metric joins is qualified with that join's alias,
    so a shared column name (e.g. ``ts_code`` in both daily_basic and stock_basic) stays
    unambiguous."""
    if field.column_name:
        if not is_valid_identifier(field.column_name):
            raise QueryError(
                f"Field '{field.name}' has an invalid column.",
                QueryFailure("QUERY_UNKNOWN_COLUMN", DEFINITION),
            )
        return f"{alias}.{_quote(field.column_name)}"
    expr = dialect_sql(field.expression, ANSI)
    if not expr:
        raise QueryError(
            f"Field '{field.name}' has no expression.",
            QueryFailure("QUERY_DEFINITION_INVALID", DEFINITION),
        )
    return expr


def dimension_sql(
    field: SemanticModelField, granularity: str | None, alias: str = _BASE_ALIAS
) -> str:
    """A field used as a group-by dimension; a time dimension is truncated to its grain."""
    expr = field_sql(field, alias)
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
        raise QueryError(
            "Order direction must be 'asc' or 'desc'.",
            QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
        )
    # NULLS LAST either way: an empty group should never top the list.
    if ref == "value":
        return f"({value_expr}) {direction.upper()} NULLS LAST"
    if ref not in dims:
        raise QueryError(
            f"Cannot order by '{ref}': group by it first.",
            QueryFailure("QUERY_ORDER_NOT_GROUPED", REQUEST),
        )
    return f"{dims[ref]} {direction.upper()} NULLS LAST"


def resolve_field(
    ref: Any,
    by_id: dict[str, SemanticModelField],
    by_name: dict[str, list[SemanticModelField]],
    *,
    base_dataset_id: str | None = None,
) -> SemanticModelField:
    """A field of the metric's scope, by id **or** name.

    The scope is the base dataset plus the datasets the metric joins. A **name** prefers the metric's
    own dataset (so ``ts_code`` keeps meaning the base's), and is an error when two joined datasets
    both declare it — address those by id.
    """
    if not isinstance(ref, str):
        raise QueryError(
            "A field reference must be a string.",
            QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
        )
    field = by_id.get(ref)
    if field is not None:
        return field
    candidates = by_name.get(ref) or []
    if not candidates:
        raise QueryError(
            f"Field '{ref}' is not a field of this metric's scope.",
            QueryFailure("QUERY_UNKNOWN_FIELD", REQUEST, ref, params={"field": ref}),
        )
    if base_dataset_id is not None:
        for candidate in candidates:
            if candidate.dataset_id == base_dataset_id:
                return candidate
    if len(candidates) > 1:
        names = ", ".join(sorted({c.dataset_id for c in candidates}))
        raise QueryError(
            f"Field name '{ref}' is ambiguous across datasets ({names}); address it by id.",
            QueryFailure(
                "QUERY_AMBIGUOUS_FIELD",
                REQUEST,
                names,
                params={"field": ref, "datasets": names},
            ),
        )
    return candidates[0]


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
    raise QueryError(
        f"Metric '{ref}' not found in this model.",
        QueryFailure("QUERY_UNKNOWN_METRIC", REQUEST),
    )


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
        raise QueryError(
            "Base dataset not found.", QueryFailure("QUERY_UNKNOWN_DATASET", DEFINITION)
        )
    ds = await db.get(DataSource, base.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise QueryError(
            "Queries only run on PostgreSQL datasets.",
            QueryFailure("QUERY_UNSUPPORTED_SOURCE", DATA),
        )

    try:
        metric_expr = validate_metric_definition(
            name=definition.name, type=definition.type, expression=definition.expression
        )
    except MetricError as exc:
        raise QueryError(
            str(exc), QueryFailure("QUERY_DEFINITION_INVALID", DEFINITION)
        ) from exc

    # The metric's relationships define its **field scope**: its own dataset, plus every dataset it
    # joins to. Resolving them first means a field of a joined dataset can be selected, grouped and
    # filtered exactly like one of the base's.
    joins_by_id, datasets_by_id = await resolve_joins(db, base, definition.joins)
    alias_by_dataset = join_dataset_aliases(
        base,
        list(definition.joins or []),
        joins_by_id=joins_by_id,
        datasets_by_id=datasets_by_id,
    )
    scope_ids = [base.id, *alias_by_dataset]

    field_rows = (
        await db.execute(
            select(SemanticModelField).where(
                SemanticModelField.semantic_model_id == model_id,
                SemanticModelField.dataset_id.in_(scope_ids),
            )
        )
    ).scalars().all()
    # Base fields first, so a name that exists on both sides keeps meaning the base's.
    ordered = sorted(field_rows, key=lambda f: 0 if f.dataset_id == base.id else 1)
    by_id = {f.id: f for f in ordered}
    by_name: dict[str, list[SemanticModelField]] = {}
    for f in ordered:
        by_name.setdefault(f.name, []).append(f)

    def alias_for(field: SemanticModelField) -> str:
        return alias_by_dataset.get(field.dataset_id, _BASE_ALIAS)

    dimensions: list[tuple[str, str]] = []
    dims_by_name: dict[str, str] = {}
    for entry in group_by or []:
        ref = entry.get("field") if isinstance(entry, dict) else entry
        field = resolve_field(ref, by_id, by_name, base_dataset_id=base.id)
        expr = dimension_sql(
            field,
            entry.get("granularity") if isinstance(entry, dict) else None,
            alias_for(field),
        )
        dimensions.append((expr, field.name))
        dims_by_name[field.name] = expr

    conditions: list[tuple[str, str, Any]] = [
        (f'{_BASE_ALIAS}.{_quote(str(f.get("column")))}', str(f.get("op")), f.get("value"))
        for f in (definition.filters or [])
        if isinstance(f.get("column"), str) and is_valid_identifier(f["column"])
    ]
    for f in filters or []:
        filtered = resolve_field(f.get("field"), by_id, by_name, base_dataset_id=base.id)
        conditions.append((field_sql(filtered, alias_for(filtered)), str(f.get("op")), f.get("value")))

    capped_limit = min(max(1, int(limit or DEFAULT_LIMIT)), DEFAULT_ROW_CAP)
    try:
        joins_sql = build_joins_sql(
            base,
            list(definition.joins or []),
            joins_by_id=joins_by_id,
            datasets_by_id=datasets_by_id,
        )
        where, params = build_conditions(conditions)
    except SqlBuildError as exc:
        raise QueryError(
            str(exc), QueryFailure("QUERY_DEFINITION_INVALID", DEFINITION)
        ) from exc

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
    except (SQLAlchemyError, OSError, TypeError, ValueError) as exc:
        # The source answered with an error: classify it so the answer pane can explain it.
        failure = classify_sql_error(exc)
        raise QueryError(f"Query failed: {exc}", failure) from exc
    duration_ms = int((time.perf_counter() - started) * 1000)

    capped = len(rows) > capped_limit
    rows = rows[:capped_limit]
    columns = [*[name for _, name in dimensions], "value"]
    return sql, columns, rows, capped, duration_ms
