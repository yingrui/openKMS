"""Summarising a dataset's table: group-by columns + whitelisted aggregates.

A dataset in Data Insights could only *browse* rows; summarising ("turnover by month",
"count per industry") needed the model path. This is the same read-only, capped contract as the rows
query, over the same columns and filters — the only new vocabulary is a small aggregate whitelist.

Validation and SQL live here (pure, testable); execution lives with the other dataset reader.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.data_layer.query_errors import REQUEST, QueryFailure
from app.services.data_layer.row_filters import RowFilterError
from app.services.data_layer.sql_build import quote_identifier
from app.services.ontology.dataset_tables import is_valid_identifier

#: Aggregates a summary may use. `count` with no column is `COUNT(*)`.
AGGREGATE_FNS = ("count", "sum", "avg", "min", "max")
#: A summary line with more than this many aggregates (or group columns) is a report, not a glance.
MAX_AGGREGATES = 8
MAX_GROUP_BY = 3
#: Grains a temporal group column may be truncated to (a query-time choice, like the model side).
GRANULARITIES = ("day", "week", "month", "quarter", "year")


@dataclass(frozen=True)
class Aggregate:
    """One output column of a summary: `fn` over `column` (None = `COUNT(*)`), named `name`."""

    fn: str
    column: str | None
    name: str


def _failure(code: str, detail: str, **params: Any) -> QueryFailure:
    return QueryFailure(code, REQUEST, detail, params=params)


def _valid_column(column: Any, columns: set[str] | None) -> bool:
    return (
        isinstance(column, str)
        and is_valid_identifier(column)
        and (columns is None or column in columns)
    )


@dataclass(frozen=True)
class GroupColumn:
    """A group-by column, optionally truncated to a grain (temporal columns only)."""

    column: str
    granularity: str | None = None


def parse_group_by(
    raw: list[Any] | None,
    columns: set[str] | None = None,
    types: dict[str, str] | None = None,
) -> list[GroupColumn]:
    """The columns to group by — a bare name, or `{"column", "granularity"}` for “by month”.

    A granularity is a query-time grain (never stored on the column) and is only valid on a
    temporal one, which is why the caller passes the table's column types.
    """
    entries = list(raw or [])
    for entry in entries:
        if not isinstance(entry, (str, dict)):
            # Dropping it would answer a *different* question ("by month" turning into "everything").
            raise RowFilterError(
                "A group column is a name or {column, granularity}.",
                _failure("DATASET_AGGREGATE_BAD_GROUP", str(entry), group=str(entry)),
            )
    if len(entries) > MAX_GROUP_BY:
        raise RowFilterError(
            f"Too many group-by columns ({len(entries)} > {MAX_GROUP_BY}).",
            _failure("DATASET_AGGREGATE_TOO_MANY_GROUPS", str(len(entries)), max=MAX_GROUP_BY),
        )
    out: list[GroupColumn] = []
    for entry in entries:
        column = entry if isinstance(entry, str) else entry.get("column")
        granularity = None if isinstance(entry, str) else entry.get("granularity")
        if not _valid_column(column, columns):
            raise RowFilterError(
                f"'{column}' is not a column of this table.",
                _failure("DATASET_ROWS_UNKNOWN_COLUMN", str(column), column=column),
            )
        if granularity is not None:
            if granularity not in GRANULARITIES:
                raise RowFilterError(
                    f"Unsupported granularity '{granularity}'.",
                    _failure("DATASET_AGGREGATE_BAD_GRAIN", str(granularity), granularity=str(granularity)),
                )
            kind = (types or {}).get(str(column))
            if types is not None and not (kind or "").startswith("timestamp") and kind not in ("date", "datetime"):
                raise RowFilterError(
                    f"'{column}' is not a date column, so it has no grain.",
                    _failure("DATASET_AGGREGATE_BAD_GRAIN", str(column), column=str(column)),
                )
        out.append(GroupColumn(column=str(column), granularity=granularity))
    return out


def parse_aggregates(raw: list[dict[str, Any]] | None, columns: set[str] | None = None) -> list[Aggregate]:
    """The summary's aggregates: whitelisted `fn`, a real column (or none for `count`), unique names."""
    entries = [a for a in (raw or []) if isinstance(a, dict)]
    if not entries:
        raise RowFilterError(
            "A summary needs at least one aggregate.",
            _failure("DATASET_AGGREGATE_MISSING", "no aggregates"),
        )
    if len(entries) > MAX_AGGREGATES:
        raise RowFilterError(
            f"Too many aggregates ({len(entries)} > {MAX_AGGREGATES}).",
            _failure("DATASET_AGGREGATE_TOO_MANY", str(len(entries)), max=MAX_AGGREGATES),
        )
    out: list[Aggregate] = []
    seen: set[str] = set()
    for entry in entries:
        fn = str(entry.get("fn") or "").lower()
        if fn not in AGGREGATE_FNS:
            raise RowFilterError(
                f"Unsupported aggregate '{fn}'.",
                _failure("DATASET_AGGREGATE_BAD_FN", fn, fn=fn),
            )
        column = entry.get("column")
        if column in (None, ""):
            if fn != "count":
                raise RowFilterError(
                    f"'{fn}' needs a column.",
                    _failure("DATASET_AGGREGATE_BAD_FN", fn, fn=fn),
                )
            column = None
        elif not _valid_column(column, columns):
            raise RowFilterError(
                f"'{column}' is not a column of this table.",
                _failure("DATASET_ROWS_UNKNOWN_COLUMN", str(column), column=column),
            )
        name = str(entry.get("name") or (fn if column is None else f"{fn}_{column}"))
        if name in seen:
            raise RowFilterError(
                f"Duplicate output name '{name}'.",
                _failure("DATASET_AGGREGATE_DUPLICATE_NAME", name, name=name),
            )
        seen.add(name)
        out.append(Aggregate(fn=fn, column=column, name=name))
    return out


def build_summary_sql(
    *,
    table: str,
    group_by: list[str],
    aggregates: list[Aggregate],
    conditions: list[str],
    params: dict[str, Any],
    order_by: list[dict[str, Any]] | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> tuple[str, dict[str, Any]]:
    """Compose the statement. ``order_by`` entries address a **group-by column or an aggregate
    name** — never raw SQL — and default to the first group-by column."""
    select = [
        (
            f"date_trunc('{g.granularity}', {quote_identifier(g.column)}) AS {quote_identifier(g.column)}"
            if g.granularity
            else f"{quote_identifier(g.column)} AS {quote_identifier(g.column)}"
        )
        for g in group_by
    ]
    for agg in aggregates:
        target = "*" if agg.column is None else quote_identifier(agg.column)
        select.append(f"{agg.fn.upper()}({target}) AS {quote_identifier(agg.name)}")

    sql = f"SELECT {', '.join(select)} FROM {table}"
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    if group_by:
        sql += " GROUP BY " + ", ".join(
            (
                f"date_trunc('{g.granularity}', {quote_identifier(g.column)})"
                if g.granularity
                else quote_identifier(g.column)
            )
            for g in group_by
        )

    order: list[str] = []
    known = {*(g.column for g in group_by), *(a.name for a in aggregates)}
    for entry in order_by or []:
        field = entry.get("field") if isinstance(entry, dict) else None
        if field not in known:
            raise RowFilterError(
                f"Cannot order by '{field}': group by it or aggregate it first.",
                _failure("DATASET_AGGREGATE_ORDER_UNKNOWN", str(field), field=str(field)),
            )
        direction = "DESC" if str(entry.get("direction") or "asc").lower() == "desc" else "ASC"
        order.append(f"{quote_identifier(str(field))} {direction} NULLS LAST")
    if not order and group_by:
        order.append(f"{quote_identifier(group_by[0].column)} ASC NULLS LAST")
    if order:
        sql += " ORDER BY " + ", ".join(order)

    if limit is not None:
        sql += f" LIMIT {int(limit)}"
        if offset:
            sql += f" OFFSET {int(offset)}"
    return sql, params


__all__ = [
    "AGGREGATE_FNS",
    "MAX_AGGREGATES",
    "MAX_GROUP_BY",
    "Aggregate",
    "GroupColumn",
    "GRANULARITIES",
    "build_summary_sql",
    "parse_aggregates",
    "parse_group_by",
]