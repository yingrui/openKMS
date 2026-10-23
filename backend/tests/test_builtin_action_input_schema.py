"""Which fields an Action's input must carry, per rule.

A modify is a patch and a delete names its target, so an object's own required columns cannot be
demanded of them — doing so rejected `{object_id}` with "Missing required input: id".
"""

from __future__ import annotations

from types import SimpleNamespace

from app.services.ontology.builtin_action_service import input_schema_for_action

HOLDING = SimpleNamespace(
    id="ot-holding",
    name="Holding",
    dataset_id="ds-1",
    key_property="id",
    properties=[
        {"name": "id", "type": "string", "required": True},
        {"name": "portfolio_id", "type": "string", "required": True},
        {"name": "ts_code", "type": "string", "required": True},
        {"name": "target_weight", "type": "number", "required": False},
    ],
)


def _schema(rule_type: str, parameters=None) -> dict:
    at = SimpleNamespace(rule_type=rule_type, parameters=parameters)
    return input_schema_for_action(at, HOLDING)


def test_create_asks_for_the_required_columns():
    assert _schema("object_create")["required"] == ["id", "portfolio_id", "ts_code"]


def test_modify_and_delete_ask_only_for_the_target():
    assert _schema("object_modify")["required"] == ["object_id"]
    assert _schema("object_delete")["required"] == ["object_id"]
    assert "object_id" in _schema("object_modify")["properties"]


def test_a_restricted_field_list_still_reports_only_its_own_required_fields():
    schema = _schema("object_create", parameters={"fields": ["target_weight"]})
    assert schema.get("required") in (None, [])


def test_a_custom_input_schema_wins():
    custom = {"type": "object", "required": ["amount"], "properties": {"amount": {"type": "number"}}}
    assert _schema("object_modify", parameters={"input_schema": custom}) == custom
