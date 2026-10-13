"""Metric DSL → SQL builder tests (pure, no DB)."""
import pytest

from app.models.dataset import Dataset
from app.models.dataset_join import DatasetJoin
from app.models.metric_definition import MetricDefinition
from app.services.data_layer.metrics import MetricError, build_metric_sql


def _dataset(dataset_id: str, schema: str = "public", table: str = "t") -> Dataset:
    return Dataset(id=dataset_id, data_source_id="ds", schema_name=schema, table_name=table)


def _metric(**kw) -> MetricDefinition:
    base = dict(
        id="m",
        dataset_id="a",
        name="n",
        aggregation="count",
        column_name=None,
        filters=None,
        joins=None,
        dimensions=None,
    )
    base.update(kw)
    return MetricDefinition(**base)


def test_count_star_has_no_params():
    sql, params = build_metric_sql(
        _dataset("a"), _metric(aggregation="count"), joins_by_id={}, datasets_by_id={}
    )
    assert 'SELECT COUNT(*) AS value FROM "public"."t" base' in sql
    assert params == {}


def test_count_column_must_be_a_valid_identifier():
    with pytest.raises(MetricError):
        build_metric_sql(
            _dataset("a"),
            _metric(aggregation="count", column_name='x"; DROP TABLE t; --'),
            joins_by_id={},
            datasets_by_id={},
        )


def test_non_count_requires_column():
    with pytest.raises(MetricError):
        build_metric_sql(
            _dataset("a"), _metric(aggregation="sum"), joins_by_id={}, datasets_by_id={}
        )


def test_filters_and_dimensions():
    metric = _metric(
        aggregation="avg",
        column_name="close",
        dimensions=["ts_code"],
        filters=[
            {"column": "trade_date", "op": ">=", "value": "2024-01-01"},
            {"column": "open", "op": "is_not_null"},
        ],
    )
    sql, params = build_metric_sql(
        _dataset("a", schema="tushare", table="stock_trade_daily"),
        metric,
        joins_by_id={},
        datasets_by_id={},
    )
    assert 'AVG("close") AS value' in sql
    assert 'GROUP BY base."ts_code"' in sql
    assert 'base."trade_date" >= :f0' in sql
    assert 'base."open" IS NOT NULL' in sql
    assert params == {"f0": "2024-01-01"}


def test_in_filter_is_parameterized():
    metric = _metric(
        aggregation="count",
        filters=[{"column": "ts_code", "op": "in", "value": ["a", "b"]}],
    )
    sql, params = build_metric_sql(
        _dataset("a"), metric, joins_by_id={}, datasets_by_id={}
    )
    assert "IN (:f0_0, :f0_1)" in sql
    assert params == {"f0_0": "a", "f0_1": "b"}


def test_join_on_clause_uses_correct_side():
    join = DatasetJoin(
        id="j",
        from_dataset_id="a",
        to_dataset_id="b",
        from_columns=["ts_code"],
        to_columns=["ts_code"],
        join_type="left",
    )
    # metric dataset is the join `from` (many) side
    sql, _ = build_metric_sql(
        _dataset("a", schema="tushare", table="stock_trade_daily"),
        _metric(aggregation="count", joins=["j"]),
        joins_by_id={"j": join},
        datasets_by_id={"b": _dataset("b", schema="tushare", table="stock_basic")},
    )
    assert 'LEFT JOIN "tushare"."stock_basic" j0 ON base."ts_code" = j0."ts_code"' in sql

    # metric dataset is the join `to` (one) side
    sql2, _ = build_metric_sql(
        _dataset("b", schema="tushare", table="stock_basic"),
        _metric(dataset_id="b", aggregation="count", joins=["j"]),
        joins_by_id={"j": join},
        datasets_by_id={"a": _dataset("a", schema="tushare", table="stock_trade_daily")},
    )
    assert 'base."ts_code" = j0."ts_code"' in sql2


def test_join_type_controls_the_join_kind():
    join = DatasetJoin(
        id="j",
        from_dataset_id="a",
        to_dataset_id="b",
        from_columns=["x", "y"],
        to_columns=["u", "v"],
        join_type="inner",
    )
    sql, _ = build_metric_sql(
        _dataset("a"),
        _metric(aggregation="count", joins=["j"]),
        joins_by_id={"j": join},
        datasets_by_id={"b": _dataset("b")},
    )
    assert 'INNER JOIN "public"."t" j0 ON base."x" = j0."u" AND base."y" = j0."v"' in sql


def test_join_must_touch_the_metric_dataset():
    join = DatasetJoin(
        id="j",
        from_dataset_id="x",
        to_dataset_id="y",
        from_columns=["a"],
        to_columns=["b"],
        join_type="left",
    )
    with pytest.raises(MetricError):
        build_metric_sql(
            _dataset("a"),
            _metric(aggregation="count", joins=["j"]),
            joins_by_id={"j": join},
            datasets_by_id={"x": _dataset("x"), "y": _dataset("y")},
        )


def test_relationship_columns_must_be_aligned():
    join = DatasetJoin(
        id="j",
        from_dataset_id="a",
        to_dataset_id="b",
        from_columns=["x", "y"],
        to_columns=["u"],
        join_type="left",
    )
    with pytest.raises(MetricError):
        build_metric_sql(
            _dataset("a"),
            _metric(aggregation="count", joins=["j"]),
            joins_by_id={"j": join},
            datasets_by_id={"b": _dataset("b")},
        )


def test_invalid_aggregation_and_filter_op():
    with pytest.raises(MetricError):
        build_metric_sql(
            _dataset("a"), _metric(aggregation="median"), joins_by_id={}, datasets_by_id={}
        )
    with pytest.raises(MetricError):
        build_metric_sql(
            _dataset("a"),
            _metric(filters=[{"column": "c", "op": "drop", "value": 1}]),
            joins_by_id={},
            datasets_by_id={},
        )
