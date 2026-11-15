"""The period becomes a data scope only when the rule names a column for it."""
from app.services.ontology.rules.evaluator import period_filters


def test_no_field_means_no_filter():
    # A label, not a scope — the honest default and what the UI says out loud.
    assert period_filters(None, "2026-11-09", "2026-11-15") == []


def test_a_bound_field_filters_both_ends_inclusively():
    assert period_filters("trade_date", "2026-11-09", "2026-11-15") == [
        {"field": "trade_date", "op": ">=", "value": "2026-11-09"},
        {"field": "trade_date", "op": "<=", "value": "2026-11-15"},
    ]


def test_an_empty_period_is_left_alone():
    assert period_filters("trade_date", "", "") == []
