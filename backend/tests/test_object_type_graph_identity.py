"""Graph identity is fixed at creation, so a rename cannot orphan indexed data.

The label used to be derived from `object_types.name` on every read. Renaming a type then pointed
every read at a label nothing was indexed under: the objects looked deleted. These tests pin the
two ways out of that — the stored identity, and the name-derived fallback for legacy rows.
"""

from __future__ import annotations

from types import SimpleNamespace

from app.services.ontology.object_neo4j_store import (
    link_rel_type,
    neo4j_safe_label,
    neo4j_safe_rel_type,
    object_label,
)


def _ot(name: str, label: str | None = None):
    return SimpleNamespace(name=name, neo4j_label=label)


def _lt(name: str, rel_type: str | None = None):
    return SimpleNamespace(name=name, neo4j_rel_type=rel_type)


def test_rename_keeps_the_stored_label():
    before = _ot("Work Item", label="Work_Item")
    assert object_label(before) == "Work_Item"

    renamed = _ot("Task", label="Work_Item")
    assert object_label(renamed) == "Work_Item"


def test_rows_without_a_stored_label_fall_back_to_the_name():
    """What the migration backfill produced, and what pre-migration rows read as."""
    assert object_label(_ot("Work Item")) == "Work_Item"
    assert object_label(_ot("Work Item", label="  ")) == "Work_Item"
    assert object_label(_ot("")) == "Node"


def test_label_sanitisation_replaces_every_unsafe_character():
    assert neo4j_safe_label("Stock.Daily Bar") == "Stock_Daily_Bar"
    # Per-character replacement (not a strip): the migration backfill uses the same regexp, and
    # two such names now collide on the create-path check instead of silently sharing a label.
    assert neo4j_safe_label("价格") == "__"


def test_link_rel_type_keeps_case_and_falls_back_to_the_name():
    assert link_rel_type(_lt("governed_by", rel_type="governed_by")) == "governed_by"
    assert link_rel_type(_lt("governed_by", rel_type=None)) == "governed_by"
    assert neo4j_safe_rel_type("") == "relates_to"
    assert neo4j_safe_label("") == "Node"


def test_renaming_a_link_type_keeps_its_relationship_type():
    assert link_rel_type(_lt("covers", rel_type="governed_by")) == "governed_by"
