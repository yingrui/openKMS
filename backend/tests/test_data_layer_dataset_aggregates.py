"""Summarising a dataset table: the aggregate whitelist and the SQL it produces (pure)."""

from __future__ import annotations

import pytest

from app.services.data_layer.dataset_aggregates import (
    MAX_AGGREGATES,
    build_summary_sql,
    parse_aggregates,
    parse_group_by,
)
from app.services.data_layer.row_filters import RowFilterError

COLUMNS = {"ts_code", "trade_date", "close", "industry"}


def test_group_by_must_be_columns_of_the_table():
    grouped = parse_group_by(["industry"], COLUMNS)
    assert [(g.column, g.granularity) for g in grouped] == [("industry", None)]
    with pytest.raises(RowFilterError) as excinfo:
        parse_group_by(["nope"], COLUMNS)
    assert excinfo.value.code == "DATASET_ROWS_UNKNOWN_COLUMN"
    assert excinfo.value.kind == "request"


def test_a_summary_needs_an_aggregate():
    with pytest.raises(RowFilterError) as excinfo:
        parse_aggregates([], COLUMNS)
    assert excinfo.value.code == "DATASET_AGGREGATE_MISSING"


def test_aggregate_functions_come_from_the_whitelist():
    with pytest.raises(RowFilterError) as excinfo:
        parse_aggregates([{"fn": "median", "column": "close"}], COLUMNS)
    assert excinfo.value.code == "DATASET_AGGREGATE_BAD_FN"
    assert excinfo.value.failure.params == {"fn": "median"}


def test_only_count_may_omit_its_column():
    assert parse_aggregates([{"fn": "count"}], COLUMNS)[0].column is None
    with pytest.raises(RowFilterError) as excinfo:
        parse_aggregates([{"fn": "avg"}], COLUMNS)
    assert excinfo.value.code == "DATASET_AGGREGATE_BAD_FN"


def test_aggregate_columns_are_validated_and_named():
    parsed = parse_aggregates(
        [{"fn": "count"}, {"fn": "avg", "column": "close"}, {"fn": "max", "column": "close", "name": "peak"}],
        COLUMNS,
    )
    assert [(a.fn, a.column, a.name) for a in parsed] == [
        ("count", None, "count"),
        ("avg", "close", "avg_close"),
        ("max", "close", "peak"),
    ]
    with pytest.raises(RowFilterError):
        parse_aggregates([{"fn": "sum", "column": "nope"}], COLUMNS)


def test_output_names_must_be_unique():
    with pytest.raises(RowFilterError) as excinfo:
        parse_aggregates(
            [{"fn": "avg", "column": "close"}, {"fn": "max", "column": "close", "name": "avg_close"}],
            COLUMNS,
        )
    assert excinfo.value.code == "DATASET_AGGREGATE_DUPLICATE_NAME"


def test_too_many_aggregates_is_a_request_failure():
    with pytest.raises(RowFilterError) as excinfo:
        parse_aggregates([{"fn": "count"}] * (MAX_AGGREGATES + 1), COLUMNS)
    assert excinfo.value.code == "DATASET_AGGREGATE_TOO_MANY"


def test_the_statement_groups_aggregates_and_stays_parameterized():
    aggregates = parse_aggregates([{"fn": "count"}, {"fn": "avg", "column": "close"}], COLUMNS)
    sql, params = build_summary_sql(
        table='"public"."t"',
        group_by=parse_group_by(["industry"], COLUMNS),
        aggregates=aggregates,
        conditions=['"close" > :f0'],
        params={"f0": 100},
        order_by=[{"field": "avg_close", "direction": "desc"}],
        limit=11,
    )
    assert sql == (
        'SELECT "industry" AS "industry", COUNT(*) AS "count", AVG("close") AS "avg_close" '
        'FROM "public"."t" WHERE "close" > :f0 GROUP BY "industry" '
        'ORDER BY "avg_close" DESC NULLS LAST LIMIT 11'
    )
    # the filter value travelled as a parameter, never as SQL
    assert params == {"f0": 100}


def test_order_by_must_address_a_group_column_or_an_aggregate():
    aggregates = parse_aggregates([{"fn": "count"}], COLUMNS)
    with pytest.raises(RowFilterError) as excinfo:
        build_summary_sql(
            table='"public"."t"',
            group_by=parse_group_by(["industry"], COLUMNS),
            aggregates=aggregates,
            conditions=[],
            params={},
            order_by=[{"field": "close"}],
        )
    assert excinfo.value.code == "DATASET_AGGREGATE_ORDER_UNKNOWN"


def test_a_summary_without_grouping_is_one_row():
    aggregates = parse_aggregates([{"fn": "count"}, {"fn": "avg", "column": "close"}], COLUMNS)
    sql, _ = build_summary_sql(
        table='"public"."t"', group_by=[], aggregates=aggregates, conditions=[], params={}, limit=2
    )
    assert "GROUP BY" not in sql and "ORDER BY" not in sql and sql.endswith("LIMIT 2")


def test_a_temporal_column_can_be_grouped_by_a_grain():
    types = {"trade_date": "timestamp with time zone", "industry": "text"}
    grouped = parse_group_by([{"column": "trade_date", "granularity": "month"}], set(types), types)
    aggregates = parse_aggregates([{"fn": "count"}], set(types))
    sql, _ = build_summary_sql(
        table='"public"."t"', group_by=grouped, aggregates=aggregates, conditions=[], params={}, limit=13
    )
    assert sql == (
        'SELECT date_trunc(\'month\', "trade_date") AS "trade_date", COUNT(*) AS "count" '
        'FROM "public"."t" GROUP BY date_trunc(\'month\', "trade_date") '
        'ORDER BY "trade_date" ASC NULLS LAST LIMIT 13'
    )


def test_a_grain_on_a_non_date_column_is_a_request_failure():
    types = {"industry": "text"}
    with pytest.raises(RowFilterError) as excinfo:
        parse_group_by([{"column": "industry", "granularity": "month"}], set(types), types)
    assert excinfo.value.code == "DATASET_AGGREGATE_BAD_GRAIN"
    assert excinfo.value.failure.params == {"column": "industry"}


def test_an_unknown_grain_is_rejected():
    types = {"trade_date": "date"}
    with pytest.raises(RowFilterError) as excinfo:
        parse_group_by([{"column": "trade_date", "granularity": "fortnight"}], set(types), types)
    assert excinfo.value.code == "DATASET_AGGREGATE_BAD_GRAIN"


def test_the_api_schema_accepts_a_grain():
    """The endpoint must take what the reader supports: `{column, granularity}` for a date column.

    It did not — the schema still said `list[str]`, so "by month" answered 422 while the very same
    spec ran fine through a report (which calls the reader directly). Found by running the query.
    """
    from app.schemas.dataset import DatasetSummaryQuery

    body = DatasetSummaryQuery(
        group_by=[{"column": "trade_date", "granularity": "month"}, "industry"],
        aggregates=[{"fn": "count"}, {"fn": "avg", "column": "pe_ttm", "name": "avg_pe"}],
    )
    dumped = body.model_dump()
    assert dumped["group_by"][0] == {"column": "trade_date", "granularity": "month"}
    assert dumped["group_by"][1] == "industry"


def test_a_group_entry_the_reader_does_not_understand_is_refused():
    """Not dropped: dropping it answered a different question ("by month" → everything)."""
    with pytest.raises(RowFilterError) as excinfo:
        parse_group_by([{"column": "trade_date", "granularity": "month"}, 42], COLUMNS)
    assert excinfo.value.code == "DATASET_AGGREGATE_BAD_GROUP"
