"""Saved-query → SQL builder tests (pure, no DB)."""
import pytest

from app.models.dataset import Dataset
from app.models.dataset_field import DatasetField
from app.models.metric_definition import MetricDefinition
from app.models.saved_query import SavedQuery
from app.services.data_layer.queries import QueryError, build_query_sql


def _dataset(dataset_id: str, schema: str = "public", table: str = "t") -> Dataset:
    return Dataset(id=dataset_id, data_source_id="ds", schema_name=schema, table_name=table)


def _field(name: str, expr: str) -> DatasetField:
    return DatasetField(id=f"f_{name}", dataset_id="a", name=name, expression={"dialects": {"ANSI_SQL": expr}})


def _metric(metric_id: str, expr: str, name: str = "m") -> MetricDefinition:
    return MetricDefinition(
        id=metric_id,
        base_dataset_id="a",
        name=name,
        type="simple",
        expression={"dialects": {"ANSI_SQL": expr}},
    )


def _query(**kw) -> SavedQuery:
    base = dict(
        id="q",
        base_dataset_id="a",
        name="n",
        metrics=[{"name": "total", "metric_id": "m"}],
        group_by=["trade_date"],
        joins=[],
        filters=None,
    )
    base.update(kw)
    return SavedQuery(**base)


def _build(query, *, fields=None, metrics=None, joins=None, datasets=None, row_cap=1000):
    return build_query_sql(
        _dataset("a"),
        query,
        fields_by_name=fields if fields is not None else {"trade_date": _field("trade_date", '"trade_date"')},
        metrics_by_id=metrics if metrics is not None else {"m": _metric("m", "COUNT(*)")},
        joins_by_id=joins or {},
        datasets_by_id=datasets or {},
        row_cap=row_cap,
    )


def test_dimension_and_metric_are_selected():
    sql, columns, params = _build(_query())
    assert '"trade_date" AS "trade_date"' in sql
    assert '(COUNT(*)) AS "total"' in sql
    assert 'FROM "public"."t" base' in sql
    assert 'GROUP BY "trade_date"' in sql
    assert sql.endswith("LIMIT 1000")
    assert columns == ["trade_date", "total"]
    assert params == {}


def test_filters_are_parameterized():
    sql, _, params = _build(_query(filters=[{"column": "x", "op": ">", "value": 5}]))
    assert 'base."x" > :f0' in sql
    assert params == {"f0": 5}


def test_unknown_field_raises():
    with pytest.raises(QueryError):
        _build(_query(group_by=["missing"]))


def test_unknown_metric_raises():
    with pytest.raises(QueryError):
        _build(_query(metrics=[{"name": "total", "metric_id": "nope"}]))


def test_empty_query_raises():
    with pytest.raises(QueryError):
        _build(_query(metrics=[], group_by=[]))


def test_unsafe_alias_rejected():
    with pytest.raises(QueryError):
        _build(_query(metrics=[{"name": 'bad"alias', "metric_id": "m"}]))
