"""A period is an instance of a calendar; the filter is compiled in the field's own vocabulary."""
from app.models.metric_definition import MetricDefinition
from app.services.ontology.rules.evaluator import period_binding
from app.services.ontology.rules.periods import (
    PeriodError,
    filter_for_period,
    kind_of_dimension,
    parse_period,
)


def _metric(mode: str, dimension: str | None = None) -> MetricDefinition:
    return MetricDefinition(
        id="m",
        semantic_model_id="model",
        base_dataset_id="ds",
        name="m",
        additivity="additive",
        time_mode=mode,
        time_dimension=dimension,
    )


# --- calendars ---------------------------------------------------------------------------------


def test_labels_are_parsed_per_calendar():
    assert parse_period("2026-11-09", "day") == ("2026-11-09", "2026-11-09")
    assert parse_period("2026-W46", "week") == ("2026-11-09", "2026-11-15")
    assert parse_period("2026-11", "month") == ("2026-11-01", "2026-11-30")
    assert parse_period("2026-Q4", "quarter") == ("2026-10-01", "2026-12-31")
    assert parse_period("2026", "year") == ("2026-01-01", "2026-12-31")


def test_a_custom_calendar_keeps_its_own_key():
    # "2026-W46" is the period *key* of a cycle column; deriving dates for it would filter the wrong rows.
    assert parse_period("2026-W46", "custom") == ("2026-W46", "2026-W46")


def test_a_label_of_the_wrong_calendar_is_rejected_with_the_expected_format():
    with pytest_raises(PeriodError):
        parse_period("2026-W46", "day")


def pytest_raises(exc):
    import pytest

    return pytest.raises(exc)


def test_a_date_column_ranges_and_a_key_column_matches():
    ranged = filter_for_period("trade_date", datatype="Date", kind="week", label="2026-W46",
                               start="2026-11-09", end="2026-11-15")
    assert ranged == [
        {"field": "trade_date", "op": ">=", "value": "2026-11-09"},
        {"field": "trade_date", "op": "<=", "value": "2026-11-15"},
    ]
    keyed = filter_for_period("cycle", datatype="String", kind="custom", label="2026-W46",
                              start="2026-W46", end="2026-W46")
    assert keyed == [{"field": "cycle", "op": "=", "value": "2026-W46"}]


def test_a_single_day_on_a_date_column_is_equality():
    assert filter_for_period("d", datatype="Date", kind="day", label="2026-11-09",
                             start="2026-11-09", end="2026-11-09") == [
        {"field": "d", "op": "=", "value": "2026-11-09"}
    ]


def test_the_calendar_is_declared_then_inferred_then_a_key():
    assert kind_of_dimension({"period_kind": "week"}, "Date") == "week"
    assert kind_of_dimension(None, "Date") == "day"
    assert kind_of_dimension(None, "String") == "custom"


# --- how a metric binds to a period ------------------------------------------------------------


def test_a_period_metric_filters_on_its_time_dimension():
    filters, reason = period_binding(
        _metric("period", "trade_date"), None, "2026-W46", "2026-11-09", "2026-11-15",
        field_datatype="Date", field_dimension={"period_kind": "week"},
    )
    assert reason == ""
    assert filters == [
        {"field": "trade_date", "op": ">=", "value": "2026-11-09"},
        {"field": "trade_date", "op": "<=", "value": "2026-11-15"},
    ]


def test_an_operand_may_override_the_dimension():
    filters, _ = period_binding(
        _metric("period", "trade_date"), "cycle", "2026-W46", "2026-11-09", "2026-11-15",
        field_datatype="String", field_dimension={"period_kind": "custom"},
    )
    assert filters == [{"field": "cycle", "op": "=", "value": "2026-W46"}]


def test_a_stored_snapshot_refuses_a_past_period_instead_of_serving_today():
    filters, reason = period_binding(_metric("snapshot"), None, "2020-01-06", "2020-01-06", "2020-01-12")
    assert filters == []
    assert "stored snapshot" in reason and "2020-01-06" in reason


def test_a_metric_without_time_concept_is_a_label_only():
    filters, reason = period_binding(_metric("none"), None, "2026-W46", "2026-11-09", "2026-11-15")
    assert (filters, reason) == ([], "")
