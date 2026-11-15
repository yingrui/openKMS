"""Metric definition validation (pure, no DB)."""
import pytest

from app.services.data.metrics import (
    MetricError,
    validate_ai_context,
    validate_metric_definition,
)


def test_expression_is_returned():
    sql = validate_metric_definition(
        name="n", additivity="additive", expression={"dialects": {"ANSI_SQL": 'SUM("amount")'}}
    )
    assert sql == 'SUM("amount")'


def test_missing_expression_raises():
    with pytest.raises(MetricError):
        validate_metric_definition(name="n", additivity="additive", expression=None)


def test_multiple_statements_are_rejected():
    with pytest.raises(MetricError):
        validate_metric_definition(
            name="n", additivity="additive", expression={"dialects": {"ANSI_SQL": "COUNT(*); DROP TABLE t"}}
        )


def test_unknown_additivity_raises():
    with pytest.raises(MetricError):
        validate_metric_definition(
            name="n", additivity="magic", expression={"dialects": {"ANSI_SQL": "COUNT(*)"}}
        )


def test_name_is_required():
    with pytest.raises(MetricError):
        validate_metric_definition(name="  ", additivity="additive", expression={"dialects": {"ANSI_SQL": "COUNT(*)"}})


def test_ai_context_takes_three_lists_and_keeps_instructions():
    out = validate_ai_context(
        {
            "instructions": "0-1 之间",
            "synonyms": ["满足率", " 达成率 "],
            "examples": "各方案的满足率是多少",
            "not_for": ["缺口率"],
        }
    )
    assert out == {
        "instructions": "0-1 之间",
        "synonyms": ["满足率", "达成率"],
        "examples": ["各方案的满足率是多少"],
        "not_for": ["缺口率"],
    }


def test_ai_context_rejects_a_list_of_non_strings():
    with pytest.raises(MetricError):
        validate_ai_context({"synonyms": [1, 2]})


def test_ai_context_passes_unknown_keys_through():
    assert validate_ai_context({"owner_note": "x"}) == {"owner_note": "x"}


def test_a_mean_cannot_be_declared_additive():
    with pytest.raises(MetricError) as exc:
        validate_metric_definition(
            name="平均 WOS",
            additivity="additive",
            expression={"dialects": {"ANSI_SQL": "AVG(wos_after)"}},
        )
    assert "cannot be added" in str(exc.value)
    # The same metric declared honestly is fine.
    validate_metric_definition(
        name="平均 WOS",
        additivity="non_additive",
        expression={"dialects": {"ANSI_SQL": "AVG(wos_after)"}},
    )


def test_a_sum_is_still_additive():
    validate_metric_definition(
        name="额度",
        additivity="additive",
        expression={"dialects": {"ANSI_SQL": "SUM(allocated_qty)"}},
    )
