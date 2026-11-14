"""A derived metric names other metrics; the expression is the dependency, not a field beside it."""
import pytest

from app.models.metric_definition import MetricDefinition
from app.services.data.metric_refs import MetricRefError, expand, metric_references


def _metric(name: str, sql: str, *, base: str = "ds1", joins: list[str] | None = None) -> MetricDefinition:
    return MetricDefinition(
        id=f"id-{name}",
        semantic_model_id="model",
        base_dataset_id=base,
        name=name,
        additivity="additive",
        expression={"dialects": {"ANSI_SQL": sql}},
        joins=joins or [],
    )


ALLOC = _metric("分货额度", "SUM(allocated_qty)")
DEMAND = _metric("预测需求", "SUM(forecast_qty)")


def test_references_are_read_from_the_fragment():
    assert metric_references("SUM(a)") == []
    assert metric_references("{{分货额度}} / NULLIF({{ 预测需求 }}, 0)") == ["分货额度", "预测需求"]
    # A repeated reference is listed once.
    assert metric_references("{{a}} + {{a}}") == ["a"]


def test_reference_is_inlined_with_parentheses():
    sql, used = expand(
        "{{分货额度}} * 1.0 / NULLIF({{预测需求}}, 0)",
        [ALLOC, DEMAND],
        base_dataset_id="ds1",
        joins=[],
    )
    assert sql == "(SUM(allocated_qty)) * 1.0 / NULLIF((SUM(forecast_qty)), 0)"
    assert [m.name for m in used] == ["分货额度", "预测需求"]


def test_nested_references_expand_recursively():
    gap = _metric("分货缺口", "{{预测需求}} - {{分货额度}}")
    sql, used = expand(
        "{{分货缺口}} / NULLIF({{预测需求}}, 0)",
        [ALLOC, DEMAND, gap],
        base_dataset_id="ds1",
        joins=[],
    )
    assert sql == "((SUM(forecast_qty)) - (SUM(allocated_qty))) / NULLIF((SUM(forecast_qty)), 0)"
    assert [m.name for m in used] == ["分货缺口", "预测需求", "分货额度"]


def test_unknown_reference_is_a_definition_error():
    with pytest.raises(MetricRefError) as exc:
        expand("{{没有这个指标}}", [ALLOC], base_dataset_id="ds1", joins=[])
    assert "Unknown metric reference" in str(exc.value)


def test_cycle_is_reported_not_looped():
    a = _metric("a", "{{b}}")
    b = _metric("b", "{{a}}")
    with pytest.raises(MetricRefError) as exc:
        expand("{{a}}", [a, b], base_dataset_id="ds1", joins=[])
    assert "Circular" in str(exc.value)


def test_self_reference_is_a_cycle():
    loop = _metric("loop", "{{loop}} + 1")
    with pytest.raises(MetricRefError) as exc:
        expand("{{loop}}", [loop], base_dataset_id="ds1", joins=[])
    assert "Circular" in str(exc.value)


def test_cross_dataset_reference_is_rejected():
    other = _metric("别处", "SUM(x)", base="ds2")
    with pytest.raises(MetricRefError) as exc:
        expand("{{别处}}", [other], base_dataset_id="ds1", joins=[])
    assert "another dataset" in str(exc.value)


def test_missing_join_is_rejected():
    joined = _metric("跨表", 'SUM(o."amount")', joins=["join-1"])
    with pytest.raises(MetricRefError) as exc:
        expand("{{跨表}}", [joined], base_dataset_id="ds1", joins=[])
    assert "relationship" in str(exc.value)
    sql, _ = expand("{{跨表}}", [joined], base_dataset_id="ds1", joins=["join-1"])
    assert sql == '(SUM(o."amount"))'
