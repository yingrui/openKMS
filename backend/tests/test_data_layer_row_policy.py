"""Catalog row policies: the predicate set a data resource injects (pure — no DB)."""

from __future__ import annotations

import pytest

from app.services.data_layer.row_policy import (
    MAX_POLICY_CONDITIONS,
    RowPolicyError,
    policy_conditions,
    policy_fingerprint,
    validate_policy,
)


def test_no_policy_renders_nothing():
    assert policy_conditions(None, alias="base", claims={}) == ([], {})
    assert policy_conditions([], alias="base", claims={}) == ([], {})


def test_a_literal_policy_is_parameterized_against_the_alias():
    where, params = policy_conditions(
        [{"column": "region", "op": "=", "value": "east"}, {"column": "amount", "op": ">", "value": 0}],
        alias="base",
        claims={},
    )
    assert where == ['base."region" = :rp0', 'base."amount" > :rp1']
    assert params == {"rp0": "east", "rp1": 0}


def test_values_never_reach_the_sql_text():
    where, params = policy_conditions(
        [{"column": "region", "op": "=", "value": "east' OR '1'='1"}], alias=None, claims={}
    )
    assert where == ['"region" = :rp0']
    assert params == {"rp0": "east' OR '1'='1"}
    assert "OR" not in where[0]


def test_in_policy_is_a_list_of_params():
    where, params = policy_conditions(
        [{"column": "org_id", "op": "in", "value": ["a", "b"]}], alias="base", claims={}
    )
    assert where == ['base."org_id" IN (:rp0_0, :rp0_1)']
    assert params == {"rp0_0": "a", "rp0_1": "b"}


def test_a_claim_binding_resolves_from_the_token():
    where, params = policy_conditions(
        [{"column": "org_id", "op": "=", "claim": "org_id"}],
        alias="base",
        claims={"org_id": "acme"},
    )
    assert where == ['base."org_id" = :rp0']
    assert params == {"rp0": "acme"}


def test_a_nested_claim_path_resolves():
    where, params = policy_conditions(
        [{"column": "org_id", "op": "=", "claim": "ext.org.id"}],
        alias="base",
        claims={"ext": {"org": {"id": 7}}},
    )
    assert params == {"rp0": 7}


def test_a_missing_claim_fails_instead_of_skipping_the_predicate():
    """The escalation this guards: dropping a predicate would widen the result set."""
    with pytest.raises(RowPolicyError) as excinfo:
        policy_conditions(
            [{"column": "org_id", "op": "=", "claim": "org_id"}], alias="base", claims={}
        )
    assert excinfo.value.failure.code == "ROW_POLICY_CLAIM_MISSING"
    assert excinfo.value.failure.params == {"claim": "org_id"}


def test_unknown_column_and_operator_are_rejected_at_definition_time():
    with pytest.raises(RowPolicyError):
        validate_policy([{"column": "region; DROP TABLE t", "op": "=", "value": "x"}])
    with pytest.raises(RowPolicyError):
        validate_policy([{"column": "region", "op": "~", "value": "x"}])


def test_deny_list_operators_are_not_allowed():
    """`not_in` would silently include NULLs and future values — wrong for an access rule."""
    with pytest.raises(RowPolicyError):
        validate_policy([{"column": "region", "op": "not_in", "value": ["east"]}])


def test_a_policy_needs_a_value_or_a_claim():
    with pytest.raises(RowPolicyError):
        validate_policy([{"column": "region", "op": "="}])


def test_null_checks_carry_no_value():
    assert validate_policy([{"column": "region", "op": "is_null"}]) == [
        {"column": "region", "op": "is_null"}
    ]


def test_too_many_conditions_are_rejected():
    rows = [{"column": "region", "op": "=", "value": "east"}] * (MAX_POLICY_CONDITIONS + 1)
    with pytest.raises(RowPolicyError):
        validate_policy(rows)


def test_fingerprint_is_stable_and_order_sensitive():
    a = [{"column": "region", "op": "=", "value": "east"}]
    b = [{"column": "region", "op": "=", "value": "east"}, {"column": "tier", "op": "=", "value": 1}]
    assert policy_fingerprint(a) == policy_fingerprint(list(a))
    assert policy_fingerprint(a) != policy_fingerprint(b)
