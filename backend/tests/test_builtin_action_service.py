"""Tests for built-in object Action rules."""

from __future__ import annotations

from types import SimpleNamespace

from app.services.ontology.builtin_action_service import (
    build_edits_for_builtin_action,
    input_schema_for_action,
    writable_field_names,
)


def test_writable_field_names_from_object_type_properties():
    ot = SimpleNamespace(
        properties=[
            {"name": "title", "type": "string", "required": True},
            {"name": "status", "type": "string"},
        ]
    )
    assert writable_field_names(ot, None) == ["title", "status"]


def test_writable_field_names_respects_parameters():
    ot = SimpleNamespace(properties=[{"name": "title"}, {"name": "status"}])
    assert writable_field_names(ot, {"fields": ["title"]}) == ["title"]


def test_build_create_edit():
    at = SimpleNamespace(rule_type="object_create", parameters=None)
    ot = SimpleNamespace(name="WorkItem", properties=[{"name": "title"}, {"name": "status"}])
    edits, errors = build_edits_for_builtin_action(
        at=at,
        ot=ot,
        input_payload={"title": "Card", "status": "todo"},
        object_id=None,
    )
    assert errors == []
    assert edits == [
        {
            "op": "create",
            "object_type": "WorkItem",
            "properties": {"title": "Card", "status": "todo"},
        }
    ]


def test_build_modify_requires_object_id():
    at = SimpleNamespace(rule_type="object_modify", parameters=None)
    ot = SimpleNamespace(name="WorkItem", properties=[{"name": "status"}])
    edits, errors = build_edits_for_builtin_action(
        at=at,
        ot=ot,
        input_payload={"status": "done"},
        object_id=None,
    )
    assert edits == []
    assert errors == ["object_modify requires object_id"]


def test_build_delete_edit():
    at = SimpleNamespace(rule_type="object_delete", parameters=None)
    ot = SimpleNamespace(name="WorkItem", properties=[])
    edits, errors = build_edits_for_builtin_action(
        at=at,
        ot=ot,
        input_payload={},
        object_id="wi-1",
    )
    assert errors == []
    assert edits == [{"op": "delete", "object_type": "WorkItem", "primary_key": "wi-1"}]


def test_build_modify_applies_defaults_without_input():
    at = SimpleNamespace(
        rule_type="object_modify",
        parameters={"fields": ["status"], "defaults": {"status": "done"}},
    )
    ot = SimpleNamespace(name="WorkItem", properties=[{"name": "status"}])
    edits, errors = build_edits_for_builtin_action(
        at=at,
        ot=ot,
        input_payload={},
        object_id="wi-1",
    )
    assert errors == []
    assert edits[0]["properties"] == {"status": "done"}


def test_input_schema_for_modify_includes_properties():
    at = SimpleNamespace(rule_type="object_modify", parameters={"fields": ["title"]})
    ot = SimpleNamespace(
        properties=[{"name": "title", "type": "string", "required": True}, {"name": "status", "type": "string"}]
    )
    schema = input_schema_for_action(at, ot)
    assert schema["properties"] == {"title": {"type": "string"}, "object_id": {"type": "string"}}
    assert schema["required"] == ["title"]
