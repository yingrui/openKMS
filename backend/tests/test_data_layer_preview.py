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


# --- Ossie default rule: an omitted `is_time` follows `datatype` -----------------


def test_temporal_datatype_is_a_time_dimension_by_default():
    f = _field(name="trade_date", column_name="trade_date", expression=None, datatype="datetime")
    assert _dimension_expr(f, "month") == 'date_trunc(\'month\', base."trade_date")'


def test_ossie_enum_datatype_is_temporal_too():
    f = _field(name="d", column_name="d", expression=None, datatype="DateTimeTz")
    assert _dimension_expr(f, None) == 'date_trunc(\'day\', base."d")'


def test_explicit_false_opts_a_temporal_column_out():
    f = _field(
        name="created_at",
        column_name="created_at",
        expression=None,
        datatype="datetime",
        dimension={"is_time": False},
    )
    assert _dimension_expr(f, "day") == 'base."created_at"'


def test_explicit_true_makes_a_non_temporal_column_a_time_dimension():
    f = _field(
        name="d_year",
        column_name="d_year",
        expression=None,
        datatype="number",
        dimension={"is_time": True},
    )
    assert _dimension_expr(f, "year") == 'date_trunc(\'year\', base."d_year")'


# --- our granularity extension ---------------------------------------------------


def test_granularity_defaults_the_preview_grain():
    f = _field(
        name="trade_date",
        column_name="trade_date",
        expression=None,
        datatype="datetime",
        dimension={"is_time": True, "granularity": "week"},
    )
    assert _dimension_expr(f, None) == 'date_trunc(\'week\', base."trade_date")'
    # an explicit per-query grain still wins
    assert _dimension_expr(f, "month") == 'date_trunc(\'month\', base."trade_date")'


def _validate(dimension):
    from app.services.data_layer.semantic_model_fields import validate_dimension

    validate_dimension(dimension)


def test_validate_dimension_accepts_our_granularity():
    from app.services.data_layer.semantic_model_fields import FieldError

    _validate({"is_time": True, "granularity": "month"})
    _validate({"is_time": False})
    _validate(None)
    for bad in (
        {"is_time": True, "granularity": "fortnight"},
        {"is_time": False, "granularity": "day"},
        {"is_time": True, "timezone": "Asia/Shanghai"},
        {"type": "time"},
        {},
    ):
        try:
            _validate(bad)
        except FieldError:
            continue
        raise AssertionError(f"expected FieldError for {bad!r}")


def test_ossie_dimension_drops_our_extension():
    from app.services.data_layer.semantic_model_fields import ossie_dimension

    assert ossie_dimension({"is_time": True, "granularity": "month"}) == {"is_time": True}
    assert ossie_dimension({"is_time": False}) == {"is_time": False}
    assert ossie_dimension(None) is None
    assert ossie_dimension({}) is None
