"""Object-set filters: one vocabulary, typed comparisons, and one-hop link conditions."""

from __future__ import annotations

import pytest

from app.services.ontology.object_query import (
    OPS,
    QueryError,
    PropertyFilter,
    order_clause,
    parse_filter,
    parse_filters,
    aggregate_query,
    histogram_query,
    numeric_extent_query,
    parse_sort,
    split_link_property,
    where_clause,
)


def test_equality_compares_text_so_a_text_period_matches():
    flt = parse_filter("cycle:eq:2026-W46")
    assert flt == PropertyFilter(prop="cycle", op="eq", value="2026-W46")
    where, params = where_clause([flt], link_info={})
    assert where == "WHERE toString(n.`cycle`) = $f_0"
    assert params == {"f_0": "2026-W46"}


def test_ordering_compares_as_numbers_or_100_would_sort_before_20():
    where, _ = where_clause([parse_filter("exposure:gt:800")], link_info={})
    assert "toFloat(toString(n.`exposure`)) > toFloat($f_0)" in where


def test_value_may_contain_a_colon():
    flt = parse_filter("observed_at:eq:2026-11-23T10:30:00")
    assert flt.value == "2026-11-23T10:30:00"


def test_in_splits_on_commas_and_contains_is_case_insensitive():
    flt = parse_filter("status:in:active,paused")
    assert flt.value == ["active", "paused"]
    where, _ = where_clause([flt], link_info={})
    assert "IN $f_0" in where

    where, _ = where_clause([parse_filter("name:contains:华东")], link_info={})
    assert "toLower(toString(n.`name`)) CONTAINS toLower($f_0)" in where


def test_a_link_filter_becomes_an_exists_so_the_result_stays_the_queried_type():
    flt = parse_filter("@allocatesTo/cycle:eq:2026-W46")
    assert flt.via == "allocatesTo"
    where, params = where_clause([flt], link_info={"allocatesTo": ("ALLOCATES_TO", "out")})
    assert where == (
        "WHERE EXISTS { MATCH (n)-[:ALLOCATES_TO]->(m) "
        "WHERE toString(m.`cycle`) = $f_0 }"
    )
    assert params == {"f_0": "2026-W46"}

    where, _ = where_clause([flt], link_info={"allocatesTo": ("ALLOCATES_TO", "in")})
    assert "<-[:ALLOCATES_TO]-" in where


def test_an_unknown_link_is_refused_instead_of_ignored():
    with pytest.raises(QueryError):
        where_clause([parse_filter("@nope/cycle:eq:x")], link_info={})


def test_legacy_prop_filters_are_the_same_filter_object():
    filters = parse_filters(["status:eq:active"], {"region": "East"})
    assert [(f.prop, f.op, f.value) for f in filters] == [
        ("status", "eq", "active"),
        ("region", "eq", "East"),
    ]


def test_bad_expressions_are_rejected_not_dropped():
    for raw in ("", "cycle", "cycle:like:x", ":eq:x", "@link:x"):
        with pytest.raises(QueryError):
            parse_filter(raw)
    with pytest.raises(QueryError):
        parse_filter("status:in: , ")
    assert "eq" in OPS


def test_sort_is_ordered_and_ends_with_the_declared_key():
    assert parse_sort("-exposure,name") == [
        _sort("exposure", True),
        _sort("name", False),
    ]
    assert order_clause(parse_sort("-exposure"), key_properties=["distributor_id"]) == (
        "ORDER BY n.`exposure` DESC, n.`distributor_id` ASC"
    )
    assert order_clause([], key_properties=["id"]) == ""


def _sort(prop: str, descending: bool):
    from app.services.ontology.object_query import SortKey

    return SortKey(prop=prop, descending=descending)


def test_a_chart_on_a_linked_type_counts_objects_not_edges():
    """A distributor reachable twice through the link is still one distributor in the chart."""
    cypher = aggregate_query(
        "Distributor", "", "@allocates/cycle", limit=20, link_info={"allocates": ("allocates", "in")}
    )
    assert "MATCH (n:Distributor)  MATCH (n)<-[:allocates]-(m)" in cypher
    assert "count(DISTINCT n) AS c" in cypher
    assert "m.`cycle`" in cypher


def test_a_histogram_can_read_the_neighbouring_type_too():
    cypher = histogram_query(
        "Distributor", "", "@allocates/fair_rate", lo=0.0, width=0.25,
        link_info={"allocates": ("allocates", "out")},
    )
    assert "MATCH (n)<-[:allocates]-(m)" not in cypher
    assert "MATCH (n)-[:allocates]->(m)" in cypher
    assert "toFloat(m.`fair_rate`)" in cypher
    assert "count(DISTINCT n) AS c" in cypher


def test_a_chart_on_an_unknown_link_is_refused_rather_than_answered():
    with pytest.raises(QueryError):
        aggregate_query("Distributor", "", "@nope/cycle", limit=20, link_info={"allocates": ("x", "out")})
    with pytest.raises(QueryError):
        split_link_property("@allocates")


def test_a_plain_property_still_counts_rows():
    cypher = aggregate_query("Distributor", "WHERE n.`region` = $f_0", "tier", limit=10)
    assert "count(n) AS c" in cypher
    assert "n.`tier`" in cypher


def test_a_histogram_excludes_values_that_are_not_numbers():
    cypher = histogram_query("Factor", "", "ic_ir", lo=0.0, width=0.25)
    # The node has to survive the first WITH, or the count afterwards names a variable that is gone.
    assert "toFloat(n.`ic_ir`) AS v, n AS n WHERE v IS NOT NULL" in cypher
    assert "toInteger(floor((v - $lo) / $width))" in cypher
    # The maximum sits exactly on the top edge, so it is clamped into the last interval instead of being dropped.
    assert "CASE WHEN k >= $buckets THEN $buckets - 1 ELSE k END" in cypher
    extent = numeric_extent_query("Factor", "", "ic_ir")
    assert extent.endswith("RETURN min(v) AS lo, max(v) AS hi, count(v) AS c, count(*) AS total")
    # Counting must not happen after the null filter, or `total` would just equal `count(v)`.
    assert "WHERE v IS NOT NULL" not in extent
