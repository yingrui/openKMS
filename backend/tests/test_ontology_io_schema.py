from app.services.ontology.input_schema import validate_input_against_schema
from app.services.ontology.ontology_io_schema import (
    collect_schema_relations,
    validate_schema_structure,
)


def test_structure_requires_type_name_for_object_type() -> None:
    schema = {
        "type": "object",
        "properties": {
            "workItemId": {"type": "string", "x-ontology": {"kind": "object_type"}},
        },
    }
    errors = validate_schema_structure(schema, label="input_schema")
    assert any("type_name" in e for e in errors)


def test_structure_ok_for_object_and_primitive() -> None:
    schema = {
        "type": "object",
        "properties": {
            "workItemId": {
                "type": "string",
                "x-ontology": {"kind": "object_type", "type_name": "WorkItem"},
            },
            "limit": {"type": "integer", "x-ontology": {"kind": "primitive"}},
            "plain": {"type": "string"},
        },
    }
    assert validate_schema_structure(schema) == []


def test_collect_relations() -> None:
    input_schema = {
        "type": "object",
        "properties": {
            "workItemId": {
                "type": "string",
                "x-ontology": {"kind": "object_type", "type_name": "WorkItem"},
            },
            "depIds": {
                "type": "array",
                "items": {
                    "type": "string",
                    "x-ontology": {"kind": "object_type", "type_name": "WorkItem"},
                },
            },
            "linkId": {
                "type": "string",
                "x-ontology": {"kind": "link_type", "type_name": "WorkItemAssignedTo"},
            },
        },
    }
    output_schema = {
        "type": "object",
        "properties": {
            "projectId": {
                "type": "string",
                "x-ontology": {"kind": "object_type", "type_name": "Project"},
            },
        },
    }
    rel = collect_schema_relations(input_schema, output_schema)
    assert rel["object_type_names"] == ["Project", "WorkItem"]
    assert rel["link_type_names"] == ["WorkItemAssignedTo"]
    assert any(f["path"] == "depIds[]" and f["kind"] == "object_type" for f in rel["fields"])


def test_execute_rejects_non_string_object_ref() -> None:
    schema = {
        "type": "object",
        "properties": {
            "workItemId": {
                "type": "string",
                "x-ontology": {"kind": "object_type", "type_name": "WorkItem"},
            },
        },
    }
    errors = validate_input_against_schema({"workItemId": 12}, schema)
    assert errors  # type mismatch and/or ontology id shape


def test_execute_accepts_string_object_ref() -> None:
    schema = {
        "type": "object",
        "required": ["workItemId"],
        "properties": {
            "workItemId": {
                "type": "string",
                "x-ontology": {"kind": "object_type", "type_name": "WorkItem"},
            },
            "limit": {"type": "integer"},
        },
    }
    assert validate_input_against_schema({"workItemId": "abc", "limit": 3}, schema) == []
