"""Query engine tests (pure): field SQL, conditions, statement composition.

Fields must be alias-qualified so a join onto a dataset that shares a column name
(e.g. `ts_code` in both daily_basic and stock_basic) cannot raise `AmbiguousColumn`.
"""
import pytest

from app.models.dataset import Dataset
from app.models.dataset_join import DatasetJoin
from app.models.semantic_model_field import SemanticModelField
from app.services.data_layer.query import (
    QueryError,
    _order_sql,
    build_sql,
    dimension_sql,
    field_sql,
)
from app.services.data_layer.sql_build import SqlBuildError, build_conditions, build_joins_sql


def _field(**kw) -> SemanticModelField:
    return SemanticModelField(**kw)


def test_plain_column_is_qualified_with_base_alias():
    f = _field(name="ts_code", column_name="ts_code", expression=None)
    assert dimension_sql(f, None) == 'base."ts_code"'


def test_time_dimension_is_qualified_and_date_truncated():
    f = _field(
        name="trade_date",
        column_name="trade_date",
        expression=None,
        dimension={"is_time": True},
    )
    assert dimension_sql(f, "month") == 'date_trunc(\'month\', base."trade_date")'


def test_time_dimension_granularity_defaults_and_rejects_unknown():
    f = _field(
        name="trade_date",
        column_name="trade_date",
        expression=None,
        dimension={"is_time": True},
    )
    assert dimension_sql(f, None) == 'date_trunc(\'day\', base."trade_date")'
    assert dimension_sql(f, "not-a-unit") == 'date_trunc(\'day\', base."trade_date")'


def test_non_time_dimension_is_not_date_truncated():
    f = _field(name="area", column_name="area", expression=None, dimension={})
    assert dimension_sql(f, "month") == 'base."area"'


def test_computed_dimension_keeps_its_expression():
    f = _field(
        name="bucket",
        column_name=None,
        expression={"dialects": [{"dialect": "ANSI_SQL", "expression": "width_bucket(pe, 0, 50, 5)"}]},
    )
    assert dimension_sql(f, None) == "width_bucket(pe, 0, 50, 5)"


def test_missing_expression_raises():
    f = _field(name="broken", column_name=None, expression=None)
    try:
        dimension_sql(f, None)
    except QueryError:
        return
    raise AssertionError("expected QueryError")


def test_control_characters_in_column_name_are_rejected():
    f = _field(name="evil", column_name='a"; DROP TABLE x; --', expression=None)
    try:
        dimension_sql(f, None)
    except QueryError:
        return
    raise AssertionError("expected QueryError")


# --- Ossie default rule: an omitted `is_time` follows `datatype` -----------------


def test_temporal_datatype_is_a_time_dimension_by_default():
    f = _field(name="trade_date", column_name="trade_date", expression=None, datatype="datetime")
    assert dimension_sql(f, "month") == 'date_trunc(\'month\', base."trade_date")'


def test_ossie_enum_datatype_is_temporal_too():
    f = _field(name="d", column_name="d", expression=None, datatype="DateTimeTz")
    assert dimension_sql(f, None) == 'date_trunc(\'day\', base."d")'


def test_explicit_false_opts_a_temporal_column_out():
    f = _field(
        name="created_at",
        column_name="created_at",
        expression=None,
        datatype="datetime",
        dimension={"is_time": False},
    )
    assert dimension_sql(f, "day") == 'base."created_at"'


def test_explicit_true_makes_a_non_temporal_column_a_time_dimension():
    f = _field(
        name="d_year",
        column_name="d_year",
        expression=None,
        datatype="number",
        dimension={"is_time": True},
    )
    assert dimension_sql(f, "year") == 'date_trunc(\'year\', base."d_year")'


# --- spec conformance: DataType enum + the dimension having only `is_time` --------


def _validate_datatype(datatype):
    from app.services.data_layer.semantic_model_fields import validate_datatype

    validate_datatype(datatype)


def test_datatype_must_be_the_spec_enum():
    from app.services.data_layer.semantic_model_fields import FieldError

    for ok in ("String", "Integer", "Decimal", "Float", "Boolean", "Date", "Time",
               "DateTime", "DateTimeTz", "Opaque", None, ""):
        _validate_datatype(ok)
    for bad in ("string", "number", "datetime", "text", "varchar"):
        try:
            _validate_datatype(bad)
        except FieldError:
            continue
        raise AssertionError(f"expected FieldError for datatype {bad!r}")


def test_dimension_is_optional_and_may_be_empty():
    """`dimension` may be absent, and `dimension: {}` is valid (no required keys)."""
    from app.services.data_layer.semantic_model_fields import FieldError, validate_dimension

    validate_dimension(None)
    validate_dimension({})
    validate_dimension({"is_time": True})
    validate_dimension({"is_time": False})
    for bad in ({"is_time": True, "granularity": "month"}, {"is_time": True, "timezone": "UTC"},
                {"type": "time"}, {"is_time": "yes"}, {"is_time": None},
                {"is_time": True, "entity": {}}):
        try:
            validate_dimension(bad)
        except FieldError:
            continue
        raise AssertionError(f"expected FieldError for dimension {bad!r}")


def test_empty_dimension_declaration_resolves_by_datatype():
    f = _field(name="d", column_name="d", expression=None, datatype="Date", dimension={})
    assert dimension_sql(f, None).startswith("date_trunc(")


def test_a_time_dimension_grain_is_query_time_only():
    """No stored grain: the request supplies it, else `day`."""
    f = _field(name="trade_date", column_name="trade_date", expression=None, datatype="DateTimeTz",
               dimension={"is_time": True})
    assert dimension_sql(f, None) == 'date_trunc(\'day\', base."trade_date")'
    assert dimension_sql(f, "month") == 'date_trunc(\'month\', base."trade_date")'


def test_ossie_enum_datatypes_resolve_the_time_dimension_role():
    date_field = _field(name="d", column_name="d", expression=None, datatype="Date")
    opaque = _field(name="o", column_name="o", expression=None, datatype="Opaque")
    assert dimension_sql(date_field, None).startswith("date_trunc(")
    assert dimension_sql(opaque, None) == 'base."o"'


# --- the statement --------------------------------------------------------------


def _dataset(dataset_id: str, schema: str = "public", table: str = "t") -> Dataset:
    return Dataset(id=dataset_id, data_source_id="ds", schema_name=schema, table_name=table)


def test_build_sql_composes_dimensions_where_order_and_limit():
    sql = build_sql(
        _dataset("a"),
        metric_expr="SUM(amount)",
        dimensions=[('base."area"', "area"), ("date_trunc('month', base.\"d\")", "d")],
        joins_sql=[],
        where=['base."area" = :f0'],
        order_by=["(SUM(amount)) DESC NULLS LAST"],
        limit=50,
    )
    assert sql.startswith('SELECT base."area" AS "area"')
    assert '(SUM(amount)) AS "value"' in sql
    assert 'FROM "public"."t" base' in sql
    assert 'WHERE base."area" = :f0' in sql
    assert 'GROUP BY base."area", date_trunc(' in sql
    assert 'ORDER BY (SUM(amount)) DESC NULLS LAST' in sql
    assert sql.endswith("LIMIT 50")


def test_build_sql_without_grouping_is_the_single_value():
    sql = build_sql(
        _dataset("a"),
        metric_expr="MAX(pe)",
        dimensions=[],
        joins_sql=[],
        where=[],
        order_by=[],
        limit=2,
    )
    assert sql == 'SELECT (MAX(pe)) AS "value" FROM "public"."t" base LIMIT 2'
    assert "GROUP BY" not in sql


def test_order_accepts_only_value_or_a_grouped_dimension():
    dims = {"area": 'base."area"'}
    assert _order_sql("value", "desc", "SUM(x)", dims) == "(SUM(x)) DESC NULLS LAST"
    assert _order_sql("area", "asc", "SUM(x)", dims) == 'base."area" ASC NULLS LAST'
    with pytest.raises(QueryError):
        _order_sql("ts_code", "asc", "SUM(x)", dims)
    with pytest.raises(QueryError):
        _order_sql("value", "sideways", "SUM(x)", dims)


# --- conditions (field filters + a metric's own column filters) ------------------


def test_conditions_are_parameterized():
    where, params = build_conditions(
        [
            ('base."trade_date"', ">=", "2024-01-01"),
            ('base."open"', "is_not_null", None),
        ]
    )
    assert where == ['base."trade_date" >= :f0', 'base."open" IS NOT NULL']
    assert params == {"f0": "2024-01-01"}


def test_in_and_between_conditions():
    where, params = build_conditions(
        [
            ('base."ts_code"', "in", ["a", "b"]),
            ('base."trade_date"', "between", ["2024-01-01", "2024-01-31"]),
        ]
    )
    assert where[0] == 'base."ts_code" IN (:f0_0, :f0_1)'
    assert where[1] == 'base."trade_date" BETWEEN :f1_lo AND :f1_hi'
    assert params == {"f0_0": "a", "f0_1": "b", "f1_lo": "2024-01-01", "f1_hi": "2024-01-31"}


def test_between_needs_two_values():
    with pytest.raises(SqlBuildError):
        build_conditions([('base."d"', "between", ["2024-01-01"])])


def test_unknown_operator_is_rejected():
    with pytest.raises(SqlBuildError):
        build_conditions([('base."d"', "!~", "x")])


# --- joins ----------------------------------------------------------------------


def _join(**kw) -> DatasetJoin:
    base = dict(
        id="j",
        from_dataset_id="a",
        to_dataset_id="b",
        from_columns=["ts_code"],
        to_columns=["ts_code"],
        required=False,
    )
    base.update(kw)
    return DatasetJoin(**base)


def _joins_sql(base: Dataset, join: DatasetJoin, other: Dataset) -> list[str]:
    return build_joins_sql(
        base, [join.id], joins_by_id={join.id: join}, datasets_by_id={other.id: other}
    )


def test_join_on_clause_uses_correct_side():
    sql = _joins_sql(
        _dataset("a", schema="tushare", table="stock_trade_daily"),
        _join(),
        _dataset("b", schema="tushare", table="stock_basic"),
    )
    assert sql == [
        'LEFT JOIN "tushare"."stock_basic" j0 ON base."ts_code" = j0."ts_code"'
    ]

    # the metric's base dataset is the join's `to` (one) side
    sql2 = _joins_sql(
        _dataset("b", schema="tushare", table="stock_basic"),
        _join(),
        _dataset("a", schema="tushare", table="stock_trade_daily"),
    )
    assert sql2 == [
        'LEFT JOIN "tushare"."stock_trade_daily" j0 ON base."ts_code" = j0."ts_code"'
    ]


def test_required_controls_the_join_kind():
    sql = _joins_sql(
        _dataset("a"),
        _join(from_columns=["x", "y"], to_columns=["u", "v"], required=True),
        _dataset("b"),
    )
    assert sql == [
        'INNER JOIN "public"."t" j0 ON base."x" = j0."u" AND base."y" = j0."v"'
    ]


def test_join_must_touch_the_base_dataset():
    with pytest.raises(SqlBuildError):
        _joins_sql(
            _dataset("a"),
            _join(from_dataset_id="x", to_dataset_id="y"),
            _dataset("x"),
        )


def test_relationship_columns_must_be_aligned():
    with pytest.raises(SqlBuildError):
        _joins_sql(_dataset("a"), _join(from_columns=["x", "y"], to_columns=["u"]), _dataset("b"))
