"""A relation is an identity: `target = Σ weight × member`, within a tolerance."""
import pytest

from app.services.ontology.rules.relations import (
    RelationError,
    explain,
    residual,
    solve,
    validate_relation,
    weight_of,
    within_tolerance,
)


def test_residual_of_a_decomposition():
    # 预测需求 = 分货额度 + 分货缺口
    assert residual(201912, [(1.0, 128273.0), (1.0, 73639.0)]) == 0
    # One side moved by 5: the identity no longer holds.
    assert residual(201912, [(1.0, 128278.0), (1.0, 73639.0)]) == -5


def test_negative_weight_is_an_additive_check():
    # 分货缺口 = 预测需求 × 1 + 分货额度 × (−1)
    assert residual(73639, [(1.0, 201912.0), (-1.0, 128273.0)]) == 0


def test_tolerance_absolute_and_relative():
    assert within_tolerance(0.4, 100.0, {"abs": 0.5})
    assert not within_tolerance(0.6, 100.0, {"abs": 0.5})
    # 0.1% of 128,273 is ~128 rows.
    assert within_tolerance(128.0, 128273.0, {"rel": 0.001})
    assert not within_tolerance(129.0, 128273.0, {"rel": 0.001})
    # A zero target cannot use a relative tolerance — that is what `abs` is for.
    assert not within_tolerance(1.0, 0.0, {"rel": 0.001})
    assert within_tolerance(1.0, 0.0, {"abs": 1.0})


def _relation(**over):
    base = {
        "target": {"metric": "m-allocation"},
        "members": [{"metric": "m-scenario-kpi", "weight": 1}],
        "tolerance": {"abs": 1},
    }
    return {**base, **over}


def test_a_valid_relation_passes_validation():
    validate_relation(_relation())


def test_weight_defaults_to_one():
    assert weight_of({"metric": "m"}) == 1.0
    assert weight_of({"metric": "m", "weight": -1}) == -1.0


def test_target_must_be_a_metric():
    with pytest.raises(RelationError):
        validate_relation(_relation(target={"dataset_agg": {"dataset_id": "d", "fn": "sum"}}))
    with pytest.raises(RelationError):
        validate_relation(_relation(target=""))


def test_members_must_be_a_non_empty_list():
    with pytest.raises(RelationError):
        validate_relation(_relation(members=[]))
    with pytest.raises(RelationError):
        validate_relation(_relation(members=[{"weight": 1}]))


def test_tolerance_must_be_abs_or_rel():
    with pytest.raises(RelationError):
        validate_relation(_relation(tolerance={"absolut": 1}))
    with pytest.raises(RelationError):
        validate_relation(_relation(tolerance={"abs": -1}))
    with pytest.raises(RelationError):
        validate_relation(_relation(tolerance={}))


def test_unknown_keys_are_rejected_rather_than_ignored():
    with pytest.raises(RelationError):
        validate_relation(_relation(mamber=[]))


def test_explain_reads_like_an_identity():
    text = explain(_relation(), ["分货额度", "方案累计额度"])
    assert text == "分货额度 = 方案累计额度（±1）"
    weighted = explain(
        {
            "target": {"metric": "a"},
            "members": [{"metric": "b", "weight": 1}, {"metric": "c", "weight": -1}],
            "tolerance": {"rel": 0.001},
        },
        ["a", "b", "c"],
    )
    assert weighted == "a = b + c × -1（±0.1%）"


# --- 推算 (solve): an identity that is checked can also fill in the one number it did not receive ------

GAP = {
    "target": {"metric": "gap"},
    "members": [{"metric": "demand", "weight": 1}, {"metric": "alloc", "weight": -1}],
    "tolerance": {"abs": 1},
}
RATE = {
    "kind": "ratio",
    "target": {"metric": "rate"},
    "members": [{"metric": "alloc"}, {"metric": "demand"}],
    "tolerance": {"rel": 0.001},
}


def test_decomposition_infers_the_missing_target():
    out = solve(GAP, {"demand": 201912.0, "alloc": 128273.0})
    assert out["status"] == "inferred"
    assert out["metric"] == "gap"
    assert out["value"] == 73639.0
    assert "measured" in out["assumption"]


def test_decomposition_infers_a_missing_member_with_its_weight():
    # gap = demand − alloc  ⇒  alloc = (demand − gap) / 1 … with weight −1 that is demand − gap.
    out = solve(GAP, {"demand": 201912.0, "gap": 73639.0})
    assert out["metric"] == "alloc"
    assert out["value"] == 128273.0


def test_two_missing_numbers_are_undetermined_not_guessed():
    out = solve(GAP, {"demand": 201912.0})
    assert out["status"] == "undetermined"
    assert set(out["missing"]) == {"gap", "alloc"}


def test_a_full_set_that_disagrees_is_contradictory():
    out = solve(GAP, {"demand": 201912.0, "alloc": 128273.0, "gap": 70000.0})
    assert out["status"] == "contradictory"
    assert out["residual"] == -3639.0


def test_ratio_infers_each_of_its_three_roles():
    rate = solve(RATE, {"alloc": 128273.0, "demand": 201912.0})
    assert rate["status"] == "inferred" and rate["metric"] == "rate"
    assert round(rate["value"], 6) == 0.635292

    alloc = solve(RATE, {"rate": 0.6353, "demand": 201912.0})
    assert alloc["metric"] == "alloc" and round(alloc["value"], 1) == 128274.7

    demand = solve(RATE, {"rate": 0.6353, "alloc": 128273.0})
    assert demand["metric"] == "demand" and round(demand["value"], 1) == 201909.3


def test_ratio_with_a_zero_denominator_is_undetermined():
    out = solve(RATE, {"alloc": 10.0, "demand": 0.0})
    assert out["status"] == "undetermined"


def test_ratio_disagreement_reports_the_residual():
    out = solve(RATE, {"rate": 0.9, "alloc": 128273.0, "demand": 201912.0})
    assert out["status"] == "contradictory"
    assert out["residual"] > 0.2


def test_a_ratio_relation_needs_exactly_two_members():
    with pytest.raises(RelationError):
        validate_relation({**RATE, "members": [{"metric": "alloc"}]})
