"""A row as graph properties: what a node can hold, and what a measure inside a blob has to become."""

from __future__ import annotations

from app.services.ontology.object_neo4j_store import flatten_props


def test_a_nested_measure_becomes_a_property_of_its_own():
    row = {"id": "s1", "kpis": {"fill_rate": 0.579, "waste_qty": 15}}
    assert flatten_props(row) == {
        "id": "s1",
        "kpis.fill_rate": 0.579,
        "kpis.waste_qty": 15,
    }


def test_a_second_level_keeps_both_parents():
    assert flatten_props({"a": {"b": {"c": 1}}}) == {"a.b.c": 1}


def test_a_list_of_scalars_stays_a_list_and_a_list_of_maps_does_not():
    assert flatten_props({"tags": ["x", "y"]}) == {"tags": ["x", "y"]}
    assert flatten_props({"rows": [{"a": 1}]}) == {"rows": "[{'a': 1}]"}


def test_nulls_are_dropped_rather_than_stored():
    assert flatten_props({"a": None, "b": 1}) == {"b": 1}


def test_an_empty_map_is_not_a_property():
    assert flatten_props({"kpis": {}, "id": "x"}) == {"id": "x"}
