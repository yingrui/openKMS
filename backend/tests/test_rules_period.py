"""A period is a filter with an interval: the calendar decides the dates, the column decides the predicate."""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.rules import RuleArgument, RuleRunParams, _validate_run_params
from app.services.ontology.rules.evaluator import RulePeriod
from app.services.ontology.rules.periods import PeriodError, kind_of_dimension, parse_period


# --- calendars ---------------------------------------------------------------------------------


def test_labels_are_parsed_per_calendar():
    assert parse_period("2026-11-09", "day") == ("2026-11-09", "2026-11-09")
    assert parse_period("2026-W46", "week") == ("2026-11-09", "2026-11-15")
    assert parse_period("2026-11", "month") == ("2026-11-01", "2026-11-30")
    assert parse_period("2026-Q4", "quarter") == ("2026-10-01", "2026-12-31")
    assert parse_period("2026", "year") == ("2026-01-01", "2026-12-31")


def test_a_label_of_the_wrong_calendar_is_rejected_with_the_expected_format():
    with pytest.raises(PeriodError):
        parse_period("2026-W46", "day")


def test_the_calendar_comes_from_the_column_then_the_datatype():
    assert kind_of_dimension(None, "Date") == "day"
    # A text key column (`cycle`) is a week only because its column says how the value is written.
    assert kind_of_dimension(None, "String", "%G-W%V") == "week"
    assert kind_of_dimension(None, "String") == "custom"
    # An override can still take a temporal column off the time axis.
    assert kind_of_dimension({"is_time": False}, "Date") == "custom"


# --- how the period reaches an operand ----------------------------------------------------------


def _period(datatype: str) -> RulePeriod:
    return RulePeriod(
        field="cycle", label="2026-W46", start="2026-11-09", end="2026-11-15",
        kind="week", datatype=datatype, dimension=None,
    )


def test_a_key_column_matches_the_label():
    assert _period("String").filters() == [{"field": "cycle", "op": "=", "value": "2026-W46"}]


def test_a_date_column_ranges_over_the_interval():
    assert _period("Date").filters("trade_date") == [
        {"field": "trade_date", "op": ">=", "value": "2026-11-09"},
        {"field": "trade_date", "op": "<=", "value": "2026-11-15"},
    ]


def test_an_operand_may_point_at_its_own_period_column():
    assert _period("String").filters("cycle_key") == [
        {"field": "cycle_key", "op": "=", "value": "2026-W46"}
    ]


# --- the period argument must be able to name an interval ----------------------------------------


class _Session:
    def __init__(self, field):
        self.field = field

    async def get(self, model, _key):
        if model.__name__ == "MetricDefinition":
            return SimpleNamespace(id="m", semantic_model_id="model", name="m")
        return None

    async def execute(self, _query):
        rows = [self.field] if self.field else []
        return _Rows(rows)


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def first(self):
        return self._rows[0] if self._rows else None


def test_a_custom_calendar_cannot_label_a_run():
    """Its value does not name an interval, so an "event period" built from it would be a lie."""
    # A text field with no column and no `time_format` anywhere: nothing names an interval.
    field = SimpleNamespace(dimension=None, datatype="String", column_name=None, dataset_id="d")
    params = RuleRunParams(
        arguments=[RuleArgument(key="cycle", kind="filter", field="cycle", role="period")]
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(_validate_run_params(_Session(field), "m", params, None))
    assert exc.value.status_code == 400
    assert "custom calendar" in exc.value.detail
