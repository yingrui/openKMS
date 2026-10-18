"""The frozen identifier: valid shape, sensible derivation, never a silent clash.

`api_name` is what published Function source calls (`client("WorkItem")`) and what Cypher labels
(`MATCH (n:WorkItem)`), so it must stay ASCII-identifier shaped and it must not change. Derivation
only ever has to cover names that are not already identifiers.
"""

from __future__ import annotations

import pytest

from app.services.ontology.api_names import (
    ApiNameError,
    derive_api_name,
    is_valid_api_name,
    resolve_api_name,
    unique_api_name,
)


@pytest.mark.parametrize("value", ["WorkItem", "governed_by", "Stock", "a", "Type_2"])
def test_valid_identifiers(value: str):
    assert is_valid_api_name(value)


@pytest.mark.parametrize("value", ["", None, "2Fast", "_private", "work-item", "work item", "价格", "a" * 129])
def test_invalid_identifiers(value):
    assert not is_valid_api_name(value)


def test_a_name_that_is_already_an_identifier_is_kept_verbatim():
    """`governed_by` must not become `GovernedBy`: existing Functions call it by that string."""
    assert derive_api_name("WorkItem") == "WorkItem"
    assert derive_api_name("governed_by") == "governed_by"


def test_punctuated_names_become_pascal_case():
    assert derive_api_name("Work Item") == "WorkItem"
    assert derive_api_name("Stock.Daily Bar") == "StockDailyBar"
    assert derive_api_name("  insurance  product ") == "InsuranceProduct"


def test_a_name_with_no_ascii_has_no_candidate():
    """A generated `Type_a1b2c3` is a worse contract than asking the author for one."""
    assert derive_api_name("价格") is None
    assert derive_api_name("") is None
    assert derive_api_name(None) is None


def test_a_name_starting_with_a_digit_gets_a_prefix():
    assert derive_api_name("360 Feedback") == "Type360Feedback"


def test_collisions_get_a_suffix_instead_of_failing():
    assert unique_api_name("WorkItem", set()) == "WorkItem"
    assert unique_api_name("WorkItem", {"WorkItem"}) == "WorkItem_2"
    assert unique_api_name("WorkItem", {"WorkItem", "WorkItem_2"}) == "WorkItem_3"


def test_a_suffix_never_exceeds_the_column_length():
    base = "A" * 128
    candidate = unique_api_name(base, {base})
    assert len(candidate) == 128
    assert candidate.endswith("_2")


def test_requested_name_wins_and_is_validated():
    assert resolve_api_name(requested="WorkItem", display_name="任务", taken=set()) == "WorkItem"
    with pytest.raises(ApiNameError, match="must start with a letter"):
        resolve_api_name(requested="work-item", display_name="Task", taken=set())
    with pytest.raises(ApiNameError, match="already used"):
        resolve_api_name(requested="Task", display_name="Task", taken={"Task"})


def test_derivation_is_used_when_none_was_requested():
    assert resolve_api_name(requested=None, display_name="Work Item", taken=set()) == "WorkItem"
    assert resolve_api_name(requested="", display_name="Work Item", taken=set()) == "WorkItem"


def test_a_name_without_ascii_requires_an_explicit_api_name():
    with pytest.raises(ApiNameError, match="Supply api_name explicitly"):
        resolve_api_name(requested=None, display_name="工作任务", taken=set())
