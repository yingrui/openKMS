"""Metric definition validation (pure, no DB)."""
import pytest

from app.services.data_layer.metrics import MetricError, validate_metric_definition


def test_expression_is_returned():
    sql = validate_metric_definition(
        name="n", type="simple", expression={"dialects": {"ANSI_SQL": 'SUM("amount")'}}
    )
    assert sql == 'SUM("amount")'


def test_missing_expression_raises():
    with pytest.raises(MetricError):
        validate_metric_definition(name="n", type="simple", expression=None)


def test_multiple_statements_are_rejected():
    with pytest.raises(MetricError):
        validate_metric_definition(
            name="n", type="simple", expression={"dialects": {"ANSI_SQL": "COUNT(*); DROP TABLE t"}}
        )


def test_unknown_type_raises():
    with pytest.raises(MetricError):
        validate_metric_definition(
            name="n", type="magic", expression={"dialects": {"ANSI_SQL": "COUNT(*)"}}
        )


def test_name_is_required():
    with pytest.raises(MetricError):
        validate_metric_definition(name="  ", type="simple", expression={"dialects": {"ANSI_SQL": "COUNT(*)"}})
