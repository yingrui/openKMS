"""Preview SQL tests (pure): dimensions must be alias-qualified so a join onto a
dataset that shares a column name (e.g. `ts_code` in both daily_basic and
stock_basic) does not raise `AmbiguousColumn`."""
from app.models.semantic_model_field import SemanticModelField
from app.services.data_layer.preview import PreviewError, _dimension_expr


def _field(**kw) -> SemanticModelField:
    return SemanticModelField(**kw)


def test_plain_column_is_qualified_with_base_alias():
    f = _field(name="ts_code", column_name="ts_code", expression=None)
    assert _dimension_expr(f, None) == 'base."ts_code"'


def test_time_dimension_is_qualified_and_date_truncated():
    f = _field(
        name="trade_date",
        column_name="trade_date",
        expression=None,
        dimension={"is_time": True},
    )
    assert _dimension_expr(f, "month") == 'date_trunc(\'month\', base."trade_date")'


def test_time_dimension_granularity_defaults_and_rejects_unknown():
    f = _field(
        name="trade_date",
        column_name="trade_date",
        expression=None,
        dimension={"is_time": True},
    )
    assert _dimension_expr(f, None) == 'date_trunc(\'day\', base."trade_date")'
    assert _dimension_expr(f, "not-a-unit") == 'date_trunc(\'day\', base."trade_date")'


def test_non_time_dimension_is_not_date_truncated():
    f = _field(name="area", column_name="area", expression=None, dimension={})
    assert _dimension_expr(f, "month") == 'base."area"'


def test_computed_dimension_keeps_its_expression():
    f = _field(
        name="bucket",
        column_name=None,
        expression={"dialects": [{"dialect": "ANSI_SQL", "expression": "width_bucket(pe, 0, 50, 5)"}]},
    )
    assert _dimension_expr(f, None) == "width_bucket(pe, 0, 50, 5)"


def test_missing_expression_raises():
    f = _field(name="broken", column_name=None, expression=None)
    try:
        _dimension_expr(f, None)
    except PreviewError:
        return
    raise AssertionError("expected PreviewError")


def test_control_characters_in_column_name_are_rejected():
    f = _field(name="evil", column_name='a"; DROP TABLE x; --', expression=None)
    try:
        _dimension_expr(f, None)
    except PreviewError:
        return
    raise AssertionError("expected PreviewError")
