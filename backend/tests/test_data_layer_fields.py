"""Dataset field validation tests (pure, no DB)."""
import pytest

from app.services.data_layer.fields import (
    FieldValidationError,
    column_expression,
    expression_sql,
    validate_field,
)


def test_column_expression_round_trips():
    assert expression_sql(column_expression("ts_code")) == '"ts_code"'


def test_expression_sql_handles_non_dict():
    assert expression_sql(None) is None
    assert expression_sql({"dialects": {}}) is None
    assert expression_sql({"dialects": {"ANSI_SQL": 5}}) is None


def test_validate_requires_name():
    with pytest.raises(FieldValidationError):
        validate_field(
            name="  ", column_name="a", expression=column_expression("a"), column_names={"a"}
        )


def test_validate_rejects_unknown_column():
    with pytest.raises(FieldValidationError):
        validate_field(
            name="f", column_name="missing", expression=column_expression("missing"), column_names={"a"}
        )


def test_validate_computed_requires_expression():
    with pytest.raises(FieldValidationError):
        validate_field(name="f", column_name=None, expression=None, column_names={"a"})


def test_validate_rejects_multiple_statements():
    with pytest.raises(FieldValidationError):
        validate_field(
            name="f",
            column_name=None,
            expression={"dialects": {"ANSI_SQL": "a; DROP TABLE t"}},
            column_names={"a"},
        )


def test_validate_accepts_computed_expression():
    # Should not raise.
    validate_field(
        name="full name",
        column_name=None,
        expression={"dialects": {"ANSI_SQL": "lower(email)"}},
        column_names={"email"},
    )
