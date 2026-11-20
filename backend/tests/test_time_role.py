"""The calendar granularity is derived from the value's format, not declared beside it."""

from app.services.data.time_role import kind_of_format, resolve_time_role
from app.services.ontology.rules.periods import kind_of_dimension


def test_format_names_the_calendar():
    assert kind_of_format("%G-W%V") == "week"
    assert kind_of_format("%Y-%m") == "month"
    assert kind_of_format("%Y-%m-%d") == "day"
    assert kind_of_format("%Y") == "year"
    assert kind_of_format("%d/%m/%Y") == "day"


def test_most_granular_unit_wins():
    """`%Y-%m-%d` mentions a year too, but the value is a day."""
    assert kind_of_format("%Y-%m-%d") == "day"
    assert kind_of_format("%Y-%m") == "month"


def test_a_format_with_no_unit_is_custom():
    assert kind_of_format("W%V") == "week"
    assert kind_of_format("H1") == "custom"
    assert kind_of_format(None) is None


def test_a_temporal_column_is_a_time_axis_without_a_format():
    assert resolve_time_role(datatype="Date", time_format=None) == (True, "day")


def test_a_string_column_needs_a_format_to_be_time():
    assert resolve_time_role(datatype="String", time_format=None) == (False, "custom")
    assert resolve_time_role(datatype="String", time_format="%G-W%V") == (True, "week")


def test_a_field_may_opt_out_of_the_time_axis():
    """An audit timestamp is temporal but is not a time axis for this model."""
    assert resolve_time_role(
        datatype="DateTime", time_format=None, field_dimension={"is_time": False}
    ) == (False, "custom")


def test_legacy_period_kind_still_reads():
    """Rows written before `time_format` keep their calendar through the format that kind implies."""
    assert kind_of_dimension({"period_kind": "week"}, "String") == "week"
    assert kind_of_dimension({"period_kind": "month"}, "String") == "month"
    assert kind_of_dimension(None, "Date") == "day"
    assert kind_of_dimension(None, "String") == "custom"


def test_the_field_role_agrees_with_the_column_for_a_text_period():
    """A text column with `%G-W%V` is a week, whether you ask the columns page or the field API."""
    from app.services.data.semantic_model_fields import resolve_is_time
    from app.services.data.time_role import resolve_time_role

    assert resolve_is_time(None, "String", "%G-W%V") is True
    assert resolve_time_role(datatype="String", time_format="%G-W%V") == (True, "week")


def test_the_field_override_still_wins_over_the_column():
    from app.services.data.semantic_model_fields import resolve_is_time

    assert resolve_is_time({"is_time": False}, "String", "%G-W%V") is False
    assert resolve_is_time({"is_time": False}, "Date", None) is False


def test_a_temporal_datatype_needs_no_format():
    from app.services.data.semantic_model_fields import resolve_is_time

    assert resolve_is_time(None, "Date", None) is True
    assert resolve_is_time(None, "String", None) is False
