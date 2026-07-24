"""Optional JSON Schema validation for function execute inputs."""

from __future__ import annotations

from typing import Any


def validate_input_against_schema(input_payload: dict, input_schema: dict | None) -> list[str]:
    """Validate input against a JSON Schema object when present.

    Supports a minimal subset: ``type: object`` with ``required`` and
    ``properties`` type checks (string/number/integer/boolean/object/array).
    Empty/null schema → no validation.
    """
    if not input_schema:
        return []
    if not isinstance(input_schema, dict):
        return ["input_schema must be an object"]

    errors: list[str] = []
    schema_type = input_schema.get("type", "object")
    if schema_type != "object":
        return errors

    required = input_schema.get("required") or []
    if isinstance(required, list):
        for key in required:
            if key not in input_payload:
                errors.append(f"Missing required input: {key}")

    props = input_schema.get("properties") or {}
    if not isinstance(props, dict):
        return errors

    for key, prop_schema in props.items():
        if key not in input_payload:
            continue
        if not isinstance(prop_schema, dict):
            continue
        expected = prop_schema.get("type")
        if not expected:
            continue
        value = input_payload[key]
        if not _matches_type(value, expected):
            errors.append(f"Input {key!r} must be {expected}")
    return errors


def _matches_type(value: Any, expected: str) -> bool:
    if expected == "string":
        return isinstance(value, str)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "null":
        return value is None
    return True
