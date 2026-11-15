"""How a period relates to the data — three modes, decided by the metric, overridable per operand."""
from app.models.metric_definition import MetricDefinition
from app.services.ontology.rules.evaluator import period_binding, period_filters


def _metric(mode: str, field: str | None = None) -> MetricDefinition:
    return MetricDefinition(
        id="m",
        semantic_model_id="model",
        base_dataset_id="ds",
        name="m",
        additivity="additive",
        time_mode=mode,
        time_dimension=field,
    )


def test_a_period_metric_filters_on_its_own_column():
    filters, reason = period_binding(_metric("period", "trade_date"), None, "2026-11-09", "2026-11-15")
    assert reason == ""
    assert filters == [
        {"field": "trade_date", "op": ">=", "value": "2026-11-09"},
        {"field": "trade_date", "op": "<=", "value": "2026-11-15"},
    ]


def test_an_operand_may_override_the_column():
    filters, _ = period_binding(_metric("period", "trade_date"), "cycle", "2026-11-09", "2026-11-15")
    assert filters[0]["field"] == "cycle"


def test_a_snapshot_metric_refuses_a_past_period_instead_of_serving_today():
    filters, reason = period_binding(_metric("snapshot"), None, "2020-01-06", "2020-01-12")
    assert filters == []
    assert "snapshot" in reason and "not for" in reason


def test_a_metric_without_time_concept_is_a_label_only():
    filters, reason = period_binding(_metric("none"), None, "2026-11-09", "2026-11-15")
    assert (filters, reason) == ([], "")


def test_a_dataset_operand_filters_only_when_it_names_a_column():
    assert period_filters(None, "2026-11-09", "2026-11-15") == []
    assert period_filters("cycle", "2026-11-09", "2026-11-15")[0]["field"] == "cycle"


def test_an_empty_period_is_left_alone():
    assert period_filters("trade_date", "", "") == []
