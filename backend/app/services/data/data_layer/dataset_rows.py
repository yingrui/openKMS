"""Read a dataset's table: browse rows (filters + sort + keyset paging) or summarise it.

It is read-only, and answers with the table's columns so an empty result can still render a header.

**Row totalls cost money.** `SELECT count(*)` on a 66M-row table takes ~14s — more than the whole
page is worth, and past the statement timeout, so the grid showed nothing at all. The total now has
three honest states (`exact` / `estimated` / `unknown`): a big unfiltered table reports the planner's
`reltuples` (sub-millisecond, ±5%), a filtered one counts exactly but under a short savepointed
leash, and if that leash snaps the page still renders with the total left open. See
`choose_total_source`.

The unfiltered reader stays in `dataset_tables.fetch_dataset_rows_page` for the object/link instance
lists, whose batch sizes (up to 1000) deliberately exceed a browser's page cap; folding the two
together means moving the list callers onto the shared page-size convention first.

Filters come from `row_filters` (validated: identifiers, the shared operator whitelist,
parameterized values). A failure from the source is reported as a **data** failure — a raw table has
no "definition" side to fix, so `kind=definition` would misdirect the user.
"""

from __future__ import annotations

import logging
import time

from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import COUNT_TIMEOUT_MS, EXACT_COUNT_MAX_ROWS, MAX_PAGE_SIZE, ROWS_TIMEOUT_MS
from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.services.data.data_layer.query import QueryError
from app.services.data.data_layer.query_errors import DATA, REQUEST, QueryFailure, classify_sql_error
from app.services.data.data_layer.dataset_aggregates import (
    build_summary_sql,
    parse_aggregates,
    parse_group_by,
)
from app.services.data.data_layer.row_filters import build_row_where, parse_row_filters
from app.services.ontology.dataset_tables import (
    is_valid_identifier,
    table_column_types,
    keyset_cursor_error,
    pg_engine_for_datasource,
    resolve_pg_dataset_source,
    table_column_names,
)
from app.services.ontology.property_types import serialize_cell_value

logger = logging.getLogger(__name__)

__all__ = [
    "DatasetRowsPage",
    "DatasetSummary",
    "TotalKind",
    "choose_total_source",
    "query_dataset_rows",
    "query_dataset_summary",
]

#: How much the reported total can be trusted: an exact count, the planner's estimate, or a count
#: that ran out of time. The grid says "≈" for the second and nothing for the third.
TotalKind = Literal["exact", "estimated", "unknown"]


def choose_total_source(estimate: int | None, has_filters: bool) -> Literal["exact", "estimate", "bounded"]:
    """Decide how to answer "how many rows" without walking a huge table.

    - small table → count it: it is cheap and exactness is free there.
    - big unfiltered browse → the planner's estimate. Nobody needs the last 5% of 66M.
    - never analysed, or a filter over a big table → count, but on a short leash: a filter usually
      hits an index, and the caller can live with "unknown" when it does not.
    """
    if estimate is not None and estimate < EXACT_COUNT_MAX_ROWS:
        return "exact"
    if estimate is None:
        return "bounded"
    if not has_filters:
        return "estimate"
    return "bounded"


def _table_row_estimate(conn: Any, qualified: str) -> int | None:
    """`pg_class.reltuples` — free and approximate; `None` when the table was never analysed."""
    value = conn.execute(
        text("SELECT reltuples::bigint FROM pg_class WHERE oid = to_regclass(:name)"),
        {"name": qualified},
    ).scalar()
    if value is None:
        return None
    rows = int(value)
    return rows if rows >= 0 else None


def _resolve_total(
    conn: Any,
    *,
    qualified: str,
    where_sql: str,
    params: dict[str, Any],
) -> tuple[int | None, TotalKind]:
    """The page's total, or the best available description of it."""
    estimate = _table_row_estimate(conn, qualified)
    source = choose_total_source(estimate, bool(where_sql))
    if source == "estimate":
        assert estimate is not None  # choose_total_source only estimates when it has one
        return estimate, "estimated"

    count_sql = text(f"SELECT COUNT(*) FROM {qualified}{where_sql}")
    if source == "exact":
        return int(conn.execute(count_sql, params).scalar() or 0), "exact"

    # Bounded: a savepoint keeps a cancelled count from poisoning the page query's transaction,
    # and `SET LOCAL` inside it is undone with the savepoint, so the page sets its own leash below.
    savepoint = conn.begin_nested()
    try:
        conn.exec_driver_sql(f"SET LOCAL statement_timeout = {int(COUNT_TIMEOUT_MS)}")
        return int(conn.execute(count_sql, params).scalar() or 0), "exact"
    except SQLAlchemyError as exc:
        savepoint.rollback()
        logger.info("Row count gave up on %s (%s); total reported as unknown", qualified, type(exc).__name__)
        return None, "unknown"



@dataclass(frozen=True)
class DatasetRowsPage:
    """One page of a dataset's table, with the facts the grid needs to describe it."""

    sql: str
    columns: list[str]
    rows: list[dict[str, Any]]
    total: int | None
    total_kind: "TotalKind"
    capped: bool
    next_after: str | None


@dataclass(frozen=True)
class DatasetSummary:
    """A grouped summary of a dataset's table.

    Shaped like the model query's answer (`sql`/`columns`/`rows`/`row_count`/`capped`/`duration_ms`)
    so a caller — the Data Insights, an agent — treats a dataset answer and a model answer alike.
    """

    sql: str
    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int
    capped: bool
    duration_ms: int


def _data_failure(exc: BaseException) -> QueryFailure:
    """Report what the source said as a *data* failure (a raw table has no definition to fix)."""
    failure = classify_sql_error(exc)
    if failure.kind == DATA:
        return failure
    return QueryFailure(failure.code, DATA, failure.detail, failure.params)


async def _resolve(db: AsyncSession, dataset_id: str) -> tuple[Dataset, DataSource]:
    resolved = await resolve_pg_dataset_source(db, dataset_id)
    if not resolved:
        raise QueryError(
            f"Dataset '{dataset_id}' is not a readable PostgreSQL table.",
            QueryFailure("QUERY_UNKNOWN_DATASET", REQUEST),
        )
    return resolved


async def query_dataset_summary(
    db: AsyncSession,
    dataset_id: str,
    *,
    group_by: list[str] | None = None,
    aggregates: list[dict[str, Any]] | None = None,
    filters: list[dict[str, Any]] | None = None,
    order_by: list[dict[str, Any]] | None = None,
    limit: int = 100,
    offset: int = 0,
) -> DatasetSummary:
    """Group and aggregate one dataset table (read-only, capped, timed).

    The same column validation, filter vocabulary and timeout as the rows query, plus a whitelisted
    aggregate list; the answer is shaped like a model query's so callers need no special case.
    """
    dataset, ds = await _resolve(db, dataset_id)
    schema, table = dataset.schema_name, dataset.table_name
    quoted = f'"{schema}"."{table}"'
    limit = min(max(1, int(limit)), MAX_PAGE_SIZE)
    offset = max(0, int(offset))

    try:
        types = table_column_types(ds, schema, table)
    except (SQLAlchemyError, OSError, TypeError, ValueError) as exc:
        raise QueryError(f"Reading the table's columns failed: {exc}", _data_failure(exc)) from exc

    known = set(types)
    grouped = parse_group_by(group_by, known, types)
    parsed_aggregates = parse_aggregates(aggregates, known)
    conditions, params = build_row_where(parse_row_filters(filters, known))
    # One extra row separates "exactly the limit" from "there is more".
    sql, params = build_summary_sql(
        table=quoted,
        group_by=grouped,
        aggregates=parsed_aggregates,
        conditions=conditions,
        params=params,
        order_by=order_by,
        limit=limit + 1,
        offset=offset,
    )

    engine = pg_engine_for_datasource(ds)
    started = time.perf_counter()
    try:
        with engine.connect() as conn:
            tx = conn.begin()
            conn.exec_driver_sql(f"SET LOCAL statement_timeout = {int(ROWS_TIMEOUT_MS)}")
            result = conn.execute(text(sql), params)
            names = list(result.keys())
            rows = [
                {k: serialize_cell_value(v) for k, v in zip(names, r, strict=True)}
                for r in result.fetchall()
            ]
            tx.rollback()
    except (SQLAlchemyError, OSError, TypeError, ValueError) as exc:
        raise QueryError(f"Summarising rows failed: {exc}", _data_failure(exc)) from exc
    finally:
        engine.dispose()

    duration_ms = int((time.perf_counter() - started) * 1000)
    capped = len(rows) > limit
    rows = rows[:limit]
    return DatasetSummary(
        sql=sql,
        columns=names,
        rows=rows,
        row_count=len(rows),
        capped=capped,
        duration_ms=duration_ms,
    )


async def query_dataset_rows(
    db: AsyncSession,
    dataset_id: str,
    *,
    filters: list[dict[str, Any]] | None = None,
    sort: str | None = None,
    order: str = "asc",
    after: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> DatasetRowsPage:
    """Filter, sort and page one dataset table.

    Raises `RowFilterError` for a filter the caller got wrong (stable code + a `request` kind) and
    `QueryError` for anything the source refused (`data`), so the API can answer with the same
    `{code, message, kind}` shape the query endpoints use.
    """
    if (cursor_error := keyset_cursor_error(sort, after)) is not None:
        raise QueryError(cursor_error, QueryFailure("QUERY_INVALID_REQUEST", REQUEST))
    dataset, ds = await _resolve(db, dataset_id)
    schema, table = dataset.schema_name, dataset.table_name
    quoted = f'"{schema}"."{table}"'
    limit = min(max(1, int(limit)), MAX_PAGE_SIZE)
    offset = max(0, int(offset))

    try:
        columns = table_column_names(ds, schema, table)
    except (SQLAlchemyError, OSError, TypeError, ValueError) as exc:
        raise QueryError(f"Reading the table's columns failed: {exc}", _data_failure(exc)) from exc

    conditions, params = build_row_where(parse_row_filters(filters, set(columns)))

    direction = "DESC" if str(order).lower() == "desc" else "ASC"
    valid_sort = bool(sort and is_valid_identifier(str(sort)))
    use_keyset = bool(valid_sort and after not in (None, ""))
    if use_keyset:
        conditions.append(f'"{sort}" {"<" if direction == "DESC" else ">"} :after')
        params["after"] = after
    where_sql = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    order_sql = f' ORDER BY "{sort}" {direction}' if valid_sort else ""

    page_params = {**params, "limit": limit}
    sql = f"SELECT * FROM {quoted}{where_sql}{order_sql} LIMIT :limit"
    if not use_keyset:
        sql += " OFFSET :offset"
        page_params["offset"] = offset

    engine = pg_engine_for_datasource(ds)
    try:
        with engine.connect() as conn:
            tx = conn.begin()
            conn.exec_driver_sql(f"SET LOCAL statement_timeout = {int(ROWS_TIMEOUT_MS)}")
            total, total_kind = _resolve_total(
                conn, qualified=quoted, where_sql=where_sql, params=params
            )
            # The bounded count above may have shortened this transaction's leash (a savepoint
            # rollback restores it, but not always): the page query gets the full browse timeout.
            conn.exec_driver_sql(f"SET LOCAL statement_timeout = {int(ROWS_TIMEOUT_MS)}")
            result = conn.execute(text(sql), page_params)
            names = list(result.keys())
            rows = [
                {k: serialize_cell_value(v) for k, v in zip(names, r, strict=True)}
                for r in result.fetchall()
            ]
            tx.rollback()
    except (SQLAlchemyError, OSError, TypeError, ValueError) as exc:
        raise QueryError(f"Reading rows failed: {exc}", _data_failure(exc)) from exc
    finally:
        engine.dispose()

    next_after = None
    if valid_sort and rows:
        candidate = rows[-1].get(str(sort))
        next_after = None if candidate is None else str(candidate)
    return DatasetRowsPage(
        sql=sql,
        columns=columns,
        rows=rows,
        total=None if total is None else int(total),
        total_kind=total_kind,
        capped=len(rows) >= limit,
        next_after=next_after,
    )
