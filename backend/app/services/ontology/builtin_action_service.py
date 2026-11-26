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


def submission_criteria(parameters: object | None) -> list[str]:
    """Conditions an object must satisfy before this action applies to it.

    Declared on the action, in the same grammar as an object-set filter (`status:eq:proposed`), so the answer to
    "may I run this?" is the same whether it is asked by the menu, by the form or by the executor.
    """
    raw = action_parameters_dict(parameters).get("submission_criteria")
    if not isinstance(raw, list):
        return []
    return [str(entry).strip() for entry in raw if str(entry).strip()]


def runs_per_object(at_rule_type: str, parameters: object | None) -> bool:
    """Whether this action is applied *to each* selected object, or is simply run once.

    Creating an object is the counter-example: "录入分货假设" produces one assumption, and running it once per ticked
    row would create seven of them. A modify or delete is per object by nature, and a function that names the object
    (`object_params`) says so itself.
    """
    if at_rule_type in ("object_modify", "object_delete"):
        return True
    if at_rule_type == "object_create":
        return False
    return bool(object_param_map(parameters))


def inline_edit_spec(parameters: object | None) -> dict[str, str] | None:
    """The property this action edits in place, and the parameter that carries the new value.

    `{"inline_edit": {"prop": "is_selected"}}` says: this action is the way that cell changes, so the results table
    can offer the edit where the value is, instead of making the reader select the row, open a menu and fill a form.
    """
    raw = action_parameters_dict(parameters).get("inline_edit")
    if not isinstance(raw, dict):
        return None
    prop = str(raw.get("prop") or "").strip()
    if not prop:
        return None
    param = str(raw.get("param") or prop).strip()
    return {"prop": prop, "param": param}


def may_run_over_a_set(parameters: object | None) -> bool:
    """Whether "run on all N" may be offered. Opt-in, because the safe answer is no.

    Every other trait here can be derived from the rule (a modify acts on an object; a create produces one). "Is it
    sensible to apply this to 1,620 objects at once" is a product decision the author makes, not something the
    mechanism can infer — and inferring it is how "adopt every plan" happened.
    """
    return action_parameters_dict(parameters).get("batch") is True


def selects_one_of_a_set(parameters: object | None) -> bool:
    """The action picks one member of a set (adopting a plan, choosing a default), so it cannot run over many.

    "Mark every plan as adopted" is not a bulk version of "adopt one plan" — it is a contradiction. An action that
    sets a flag of this kind declares it, and the API refuses to spread it over a set instead of trusting the caller
    to notice.
    """
    return bool(action_parameters_dict(parameters).get("exclusive"))


def submission_permissions(parameters: object | None) -> list[str]:
    """Permissions the caller must hold for this action to be offered at all.

    Object criteria answer "does this object qualify"; this answers "does this person". Both are part of the same
    promise the menu makes, so both are asked before the button exists.
    """
    raw = action_parameters_dict(parameters).get("submission_permissions")
    if not isinstance(raw, list):
        return []
    return [str(entry).strip() for entry in raw if str(entry).strip()]


def object_ref_params(parameters: object | None) -> dict[str, dict[str, str | None]]:
    """Parameters whose value is a property of **another object** — an object reference.

    `{"object_refs": {"product_code": {"type": "Product", "property": "code"}}}` says: this parameter is a Product,
    identified by its `code`. The `type` alone is enough (the property defaults to the referenced type's key). A
    string form (`{"product_code": "Product"}`) is accepted too, because most references are to the key.
    """
    raw = action_parameters_dict(parameters).get("object_refs")
    if not isinstance(raw, dict):
        return {}
    out: dict[str, dict] = {}
    for param, spec in raw.items():
        name = str(param).strip()
        if not name:
            continue
        if isinstance(spec, str) and spec.strip():
            out[name] = {"type": spec.strip(), "property": None, "many": False}
        elif isinstance(spec, dict) and str(spec.get("type") or "").strip():
            prop = spec.get("property")
            out[name] = {
                "type": str(spec["type"]).strip(),
                "property": str(prop).strip() if prop else None,
                # A list-valued reference: "assign these six" is one parameter, not six actions.
                "many": bool(spec.get("many")),
            }
    return out


def object_param_map(parameters: object | None) -> dict[str, str]:
    """Action parameters whose value is a property of the object the action runs on.

    `{"object_params": {"adjustment_id": "id"}}` says: this parameter *is* the object's identity, so a caller who
    selected objects must not be asked for it. Without this mapping the batch path has no way to know that
    `adjustment_id` means "this one", and every object in the selection fails the function's own validation.
    """
    raw = action_parameters_dict(parameters).get("object_params")
    if not isinstance(raw, dict):
        return {}
    return {str(param): str(prop) for param, prop in raw.items() if str(param).strip()}


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
    #: A dataset-backed create only needs the identity: the application fills the rest, including
    #: any surrogate id it owns. A hand-created create is written by us, so its required properties
    #: stay required.
    key_properties: list[str] = [
        str(k) for k in (getattr(ot, "key_properties", None) or []) if str(k).strip()
    ]
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
        # The object already exists, so its own required columns are not inputs — a modify is a
        # patch and a delete supplies nothing. Only the target is required, and the executor
        # injects it from `object_id`.
        required = ["object_id"]

    if at.rule_type == "object_create" and getattr(ot, "dataset_id", None) and key_properties:
        required = [k for k in key_properties if k in properties]

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
