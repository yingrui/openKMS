"""Function input/output JSON Schema helpers with ``x-ontology`` typing.

Convention (per property or array ``items``)::

    {
      "type": "string",
      "x-ontology": {
        "kind": "primitive" | "object_type" | "link_type",
        "type_name": "WorkItem"   # required when kind is object_type or link_type
      }
    }

``kind: primitive`` (or omitted ``x-ontology``) means a normal JSON value.
``object_type`` / ``link_type`` values are instance ids (string or array of strings).
"""

from __future__ import annotations

from typing import Any, Literal

OntologyKind = Literal["primitive", "object_type", "link_type"]
ONTOLOGY_KINDS = frozenset({"primitive", "object_type", "link_type"})
X_ONTOLOGY = "x-ontology"


def _as_dict(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def read_x_ontology(node: dict[str, Any]) -> dict[str, Any] | None:
    raw = node.get(X_ONTOLOGY)
    return raw if isinstance(raw, dict) else None


def effective_kind(node: dict[str, Any]) -> OntologyKind:
    xo = read_x_ontology(node)
    if not xo:
        return "primitive"
    kind = xo.get("kind")
    if kind in ONTOLOGY_KINDS:
        return kind  # type: ignore[return-value]
    return "primitive"


def effective_type_name(node: dict[str, Any]) -> str | None:
    xo = read_x_ontology(node)
    if not xo:
        return None
    name = xo.get("type_name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    return None


def validate_schema_structure(schema: dict | None, *, label: str = "schema") -> list[str]:
    """Structural checks for Function I/O schemas (not payload values)."""
    if schema is None:
        return []
    if not isinstance(schema, dict):
        return [f"{label} must be an object"]
    errors: list[str] = []
    schema_type = schema.get("type", "object")
    if schema_type != "object":
        errors.append(f"{label} type must be object")
        return errors
    props = schema.get("properties")
    if props is None:
        return errors
    if not isinstance(props, dict):
        errors.append(f"{label}.properties must be an object")
        return errors
    for key, prop in props.items():
        errors.extend(_validate_prop_node(prop, path=f"{label}.{key}"))
    return errors


def _validate_prop_node(prop: Any, *, path: str) -> list[str]:
    errors: list[str] = []
    node = _as_dict(prop)
    if node is None:
        errors.append(f"{path} must be an object")
        return errors

    xo = read_x_ontology(node)
    if xo is not None:
        kind = xo.get("kind")
        if kind is not None and kind not in ONTOLOGY_KINDS:
            errors.append(f"{path}: x-ontology.kind must be one of {sorted(ONTOLOGY_KINDS)}")
        elif kind in ("object_type", "link_type"):
            name = xo.get("type_name")
            if not isinstance(name, str) or not name.strip():
                errors.append(f"{path}: x-ontology.type_name is required for kind={kind}")

    json_type = node.get("type")
    kind = effective_kind(node)
    if kind in ("object_type", "link_type"):
        if json_type == "array":
            items = _as_dict(node.get("items"))
            if items is None:
                errors.append(f"{path}: array ontology refs require items schema")
            else:
                item_kind = effective_kind(items) if read_x_ontology(items) else kind
                if item_kind not in ("object_type", "link_type", "primitive"):
                    errors.append(f"{path}.items: invalid ontology kind")
                if item_kind in ("object_type", "link_type"):
                    # Prefer type_name on items; fall back to parent.
                    item_name = effective_type_name(items) or effective_type_name(node)
                    if not item_name:
                        errors.append(f"{path}.items: type_name required for ontology array items")
                item_type = items.get("type")
                if item_type and item_type != "string":
                    errors.append(f"{path}.items.type should be string for ontology refs")
        elif json_type not in (None, "string"):
            errors.append(f"{path}: ontology refs should use type string (or array of string)")

    return errors


def iter_schema_fields(schema: dict | None, *, side: Literal["input", "output"]) -> list[dict[str, Any]]:
    """Flatten top-level properties into field descriptors."""
    if not schema or not isinstance(schema, dict):
        return []
    props = schema.get("properties")
    if not isinstance(props, dict):
        return []
    fields: list[dict[str, Any]] = []
    for key, prop in props.items():
        node = _as_dict(prop)
        if node is None:
            continue
        json_type = node.get("type")
        kind = effective_kind(node)
        type_name = effective_type_name(node)
        path = str(key)
        if json_type == "array":
            items = _as_dict(node.get("items")) or {}
            if read_x_ontology(items) or kind in ("object_type", "link_type"):
                kind = effective_kind(items) if read_x_ontology(items) else kind
                type_name = effective_type_name(items) or type_name
            path = f"{key}[]"
            json_type = f"array<{items.get('type') or 'string'}>"
        fields.append(
            {
                "path": path,
                "side": side,
                "kind": kind,
                "type_name": type_name,
                "json_type": json_type if isinstance(json_type, str) else None,
            }
        )
    return fields


def extract_ontology_type_names(
    *schemas: dict | None,
) -> tuple[list[str], list[str]]:
    """Unique object_type / link_type names referenced across schemas."""
    ot: set[str] = set()
    lt: set[str] = set()
    for schema in schemas:
        for field in iter_schema_fields(schema, side="input"):
            name = field.get("type_name")
            if not name:
                continue
            if field["kind"] == "object_type":
                ot.add(name)
            elif field["kind"] == "link_type":
                lt.add(name)
        for field in iter_schema_fields(schema, side="output"):
            name = field.get("type_name")
            if not name:
                continue
            if field["kind"] == "object_type":
                ot.add(name)
            elif field["kind"] == "link_type":
                lt.add(name)
    return sorted(ot), sorted(lt)


def collect_schema_relations(
    input_schema: dict | None,
    output_schema: dict | None,
) -> dict[str, Any]:
    fields = [
        *iter_schema_fields(input_schema, side="input"),
        *iter_schema_fields(output_schema, side="output"),
    ]
    # Avoid double-counting names from extract walking both — use fields list.
    ot: set[str] = set()
    lt: set[str] = set()
    for f in fields:
        name = f.get("type_name")
        if not name:
            continue
        if f["kind"] == "object_type":
            ot.add(name)
        elif f["kind"] == "link_type":
            lt.add(name)
    return {
        "object_type_names": sorted(ot),
        "link_type_names": sorted(lt),
        "fields": fields,
    }


def validate_payload_ontology_types(input_payload: dict, input_schema: dict | None) -> list[str]:
    """Value-shape checks for ontology-typed fields (ids must be strings)."""
    if not input_schema or not isinstance(input_schema, dict):
        return []
    props = input_schema.get("properties")
    if not isinstance(props, dict):
        return []
    errors: list[str] = []
    for key, prop in props.items():
        if key not in input_payload:
            continue
        node = _as_dict(prop)
        if node is None:
            continue
        kind = effective_kind(node)
        value = input_payload[key]
        json_type = node.get("type")
        if kind in ("object_type", "link_type"):
            if json_type == "array" or isinstance(value, list):
                if not isinstance(value, list):
                    errors.append(f"Input {key!r} must be an array of ids")
                    continue
                for i, item in enumerate(value):
                    if not isinstance(item, str) or not item.strip():
                        errors.append(f"Input {key!r}[{i}] must be a non-empty string id")
            elif value is not None and (not isinstance(value, str) or not str(value).strip()):
                errors.append(f"Input {key!r} must be a non-empty string id")
        elif json_type == "array":
            items = _as_dict(node.get("items")) or {}
            item_kind = effective_kind(items)
            if item_kind in ("object_type", "link_type"):
                if not isinstance(value, list):
                    errors.append(f"Input {key!r} must be an array of ids")
                else:
                    for i, item in enumerate(value):
                        if not isinstance(item, str) or not item.strip():
                            errors.append(f"Input {key!r}[{i}] must be a non-empty string id")
    return errors
