"""Metric → SQL builder tests (pure, no DB)."""
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
        base_dataset_id="a",
        name="n",
        type="simple",
        expression={"dialects": {"ANSI_SQL": "COUNT(*)"}},
        filters=None,
        joins=None,
    )
    base.update(kw)
    return MetricDefinition(**base)


def _build(dataset, metric, *, joins=None, datasets=None, row_cap=1000):
    return build_metric_sql(
        dataset,
        metric,
        joins_by_id=joins or {},
        datasets_by_id=datasets or {},
        row_cap=row_cap,
    )


def test_expression_is_injected():
    sql, params = _build(
        _dataset("a"),
        _metric(expression={"dialects": {"ANSI_SQL": 'SUM("amount")'}}),
    )
    assert 'SELECT SUM("amount") AS value FROM "public"."t" base' in sql
    assert sql.endswith("LIMIT 1000")
    assert params == {}


def test_row_cap_is_applied():
    sql, _ = _build(_dataset("a"), _metric(), row_cap=5)
    assert sql.endswith("LIMIT 5")


def test_missing_expression_raises():
    with pytest.raises(MetricError):
        _build(_dataset("a"), _metric(expression=None))


def test_multiple_statements_are_rejected():
    with pytest.raises(MetricError):
        _build(
            _dataset("a"),
            _metric(expression={"dialects": {"ANSI_SQL": "COUNT(*); DROP TABLE t"}}),
        )


def test_unknown_type_raises():
    with pytest.raises(MetricError):
        _build(_dataset("a"), _metric(type="magic"))


def test_filters_are_parameterized():
    metric = _metric(
        filters=[
            {"column": "trade_date", "op": ">=", "value": "2024-01-01"},
            {"column": "open", "op": "is_not_null"},
        ]
    )
    sql, params = _build(_dataset("a", schema="tushare", table="stock_trade_daily"), metric)
    assert 'base."trade_date" >= :f0' in sql
    assert 'base."open" IS NOT NULL' in sql
    assert params == {"f0": "2024-01-01"}


def test_in_filter_is_parameterized():
    metric = _metric(filters=[{"column": "ts_code", "op": "in", "value": ["a", "b"]}])
    sql, params = _build(_dataset("a"), metric)
    assert "IN (:f0_0, :f0_1)" in sql
    assert params == {"f0_0": "a", "f0_1": "b"}


def test_join_on_clause_uses_correct_side():
    join = DatasetJoin(
        id="j",
        from_dataset_id="a",
        to_dataset_id="b",
        from_columns=["ts_code"],
        to_columns=["ts_code"],
        required=False,
    )
    sql, _ = _build(
        _dataset("a", schema="tushare", table="stock_trade_daily"),
        _metric(joins=["j"]),
        joins={"j": join},
        datasets={"b": _dataset("b", schema="tushare", table="stock_basic")},
    )
    assert 'LEFT JOIN "tushare"."stock_basic" j0 ON base."ts_code" = j0."ts_code"' in sql

    # metric base dataset is the join `to` (one) side
    sql2, _ = _build(
        _dataset("b", schema="tushare", table="stock_basic"),
        _metric(base_dataset_id="b", joins=["j"]),
        joins={"j": join},
        datasets={"a": _dataset("a", schema="tushare", table="stock_trade_daily")},
    )
    assert 'base."ts_code" = j0."ts_code"' in sql2


def test_required_controls_the_join_kind():
    join = DatasetJoin(
        id="j",
        from_dataset_id="a",
        to_dataset_id="b",
        from_columns=["x", "y"],
        to_columns=["u", "v"],
        required=True,
    )
    sql, _ = _build(
        _dataset("a"),
        _metric(joins=["j"]),
        joins={"j": join},
        datasets={"b": _dataset("b")},
    )
    assert 'INNER JOIN "public"."t" j0 ON base."x" = j0."u" AND base."y" = j0."v"' in sql


def test_join_must_touch_the_base_dataset():
    join = DatasetJoin(
        id="j",
        from_dataset_id="x",
        to_dataset_id="y",
        from_columns=["a"],
        to_columns=["b"],
        required=False,
    )
    with pytest.raises(MetricError):
        _build(
            _dataset("a"),
            _metric(joins=["j"]),
            joins={"j": join},
            datasets={"x": _dataset("x"), "y": _dataset("y")},
        )


def test_relationship_columns_must_be_aligned():
    join = DatasetJoin(
        id="j",
        from_dataset_id="a",
        to_dataset_id="b",
        from_columns=["x", "y"],
        to_columns=["u"],
        required=False,
    )
    with pytest.raises(MetricError):
        _build(_dataset("a"), _metric(joins=["j"]), joins={"j": join}, datasets={"b": _dataset("b")})
