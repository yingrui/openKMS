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
    # A modify patches an existing object: its own required columns are not inputs.
    assert schema["required"] == ["object_id"]


def test_deleting_a_function_returns_a_label_for_the_audit_log():
    """The label is read before the row is gone — a Function has no `name` column."""
    import asyncio

    from app.models.ontology_function import OntologyFunction
    from app.services.ontology import function_service

    fn = OntologyFunction(
        id="fn-1", api_name="helloGreeting", display_name="Hello Greeting", status="archived"
    )

    class _Db:
        async def execute(self, stmt):
            class _R:
                def scalar_one(self):
                    return 0

            return _R()

        async def delete(self, row):
            self.deleted = row

        async def commit(self):
            pass

    # Exercise the label logic directly: get_function is patched, the rest is a stub.
    async def _patched(db, function_id):
        return fn

    original = function_service.get_function
    function_service.get_function = _patched
    try:
        label = asyncio.run(function_service.delete_function(_Db(), "fn-1"))
    finally:
        function_service.get_function = original
    assert label == "Hello Greeting"
