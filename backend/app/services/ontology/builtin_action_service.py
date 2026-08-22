"""Execute built-in object Actions (create / modify / delete) without a Function."""

from __future__ import annotations

from typing import Any

from app.models.object_type import ObjectType
from app.models.ontology_function import OntologyActionType
from app.services.ontology.action_rule_types import BUILTIN_OBJECT_RULE_TYPES

_PROP_TYPE_TO_JSON: dict[str, str] = {
    "string": "string",
    "text": "string",
    "number": "number",
    "integer": "integer",
    "boolean": "boolean",
    "date": "string",
    "datetime": "string",
}


def action_parameters_dict(parameters: object | None) -> dict[str, Any]:
    if isinstance(parameters, dict):
        return parameters
    return {}


def writable_field_names(ot: ObjectType, parameters: object | None) -> list[str]:
    params = action_parameters_dict(parameters)
    fields = params.get("fields")
    if isinstance(fields, list) and fields:
        return [str(f) for f in fields if str(f).strip()]
    props = ot.properties or []
    names: list[str] = []
    for prop in props:
        if isinstance(prop, dict) and prop.get("name"):
            names.append(str(prop["name"]))
    return names


def input_schema_for_action(at: OntologyActionType, ot: ObjectType) -> dict[str, Any]:
    """JSON Schema for Action input — used by clients and optional validation."""
    params = action_parameters_dict(at.parameters)
    custom = params.get("input_schema")
    if isinstance(custom, dict) and custom.get("type") == "object":
        return custom

    fields = writable_field_names(ot, at.parameters)
    properties: dict[str, Any] = {}
    required: list[str] = []
    prop_by_name = {
        str(p.get("name")): p
        for p in (ot.properties or [])
        if isinstance(p, dict) and p.get("name")
    }
    for name in fields:
        prop = prop_by_name.get(name, {})
        json_type = _PROP_TYPE_TO_JSON.get(str(prop.get("type") or "string"), "string")
        properties[name] = {"type": json_type}
        if prop.get("required"):
            required.append(name)

    if at.rule_type in ("object_modify", "object_delete"):
        properties.setdefault("object_id", {"type": "string"})
        if at.rule_type == "object_modify":
            required = list(dict.fromkeys(required))

    schema: dict[str, Any] = {"type": "object", "properties": properties}
    if required:
        schema["required"] = required
    return schema


def merge_parameter_defaults(properties: dict[str, Any], parameters: object | None) -> dict[str, Any]:
    defaults = action_parameters_dict(parameters).get("defaults")
    if not isinstance(defaults, dict) or not defaults:
        return properties
    merged = {k: v for k, v in defaults.items() if v is not None}
    merged.update(properties)
    return merged


def extract_properties_from_input(
    *,
    ot: ObjectType,
    parameters: object | None,
    input_payload: dict,
) -> dict[str, Any]:
    allowed = set(writable_field_names(ot, parameters))
    out: dict[str, Any] = {}
    for key, value in input_payload.items():
        if key in ("object_id", "object"):
            continue
        if key not in allowed:
            continue
        if value is not None:
            out[key] = value
    return out


def build_edits_for_builtin_action(
    *,
    at: OntologyActionType,
    ot: ObjectType,
    input_payload: dict,
    object_id: str | None,
) -> tuple[list[dict], list[str]]:
    """Return (edits, errors)."""
    if at.rule_type not in BUILTIN_OBJECT_RULE_TYPES:
        return [], [f"unsupported built-in rule_type: {at.rule_type}"]

    object_type_name = ot.name
    errors: list[str] = []

    if at.rule_type == "object_create":
        properties = extract_properties_from_input(
            ot=ot, parameters=at.parameters, input_payload=input_payload
        )
        properties = merge_parameter_defaults(properties, at.parameters)
        if not properties:
            errors.append("create requires at least one property value in input")
            return [], errors
        return [{"op": "create", "object_type": object_type_name, "properties": properties}], []

    pk = (object_id or input_payload.get("object_id") or "").strip()
    if not pk:
        errors.append(f"{at.rule_type} requires object_id")
        return [], errors

    if at.rule_type == "object_delete":
        return [{"op": "delete", "object_type": object_type_name, "primary_key": pk}], []

    properties = extract_properties_from_input(
        ot=ot, parameters=at.parameters, input_payload=input_payload
    )
    properties = merge_parameter_defaults(properties, at.parameters)
    if not properties:
        errors.append("modify requires at least one property value in input")
        return [], errors
    return [
        {
            "op": "modify",
            "object_type": object_type_name,
            "primary_key": pk,
            "properties": properties,
        }
    ], []
