from app.services.ontology.input_schema import validate_input_against_schema


def test_no_schema_ok() -> None:
    assert validate_input_against_schema({"a": 1}, None) == []


def test_required_missing() -> None:
    schema = {"type": "object", "required": ["name"], "properties": {"name": {"type": "string"}}}
    errors = validate_input_against_schema({}, schema)
    assert any("Missing required" in e for e in errors)


def test_type_mismatch() -> None:
    schema = {"type": "object", "properties": {"count": {"type": "integer"}}}
    errors = validate_input_against_schema({"count": "x"}, schema)
    assert any("integer" in e for e in errors)


def test_valid_input() -> None:
    schema = {
        "type": "object",
        "required": ["name"],
        "properties": {"name": {"type": "string"}, "count": {"type": "integer"}},
    }
    assert validate_input_against_schema({"name": "a", "count": 2}, schema) == []
