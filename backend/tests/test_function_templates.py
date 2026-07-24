"""Tests for ontology function source validation."""

from app.services.ontology.function_templates import (
    DEFAULT_FUNCTION_SOURCE,
    extract_function_uses,
    validate_function_source,
)


def test_default_template_valid() -> None:
    valid, errors, _warnings = validate_function_source(DEFAULT_FUNCTION_SOURCE)
    assert valid is True
    assert errors == []


def test_missing_entrypoint_fails() -> None:
    source = "def other(input: dict) -> dict:\n    return {}"
    valid, errors, _ = validate_function_source(source)
    assert valid is False
    assert any("Missing entrypoint" in e for e in errors)


def test_disallowed_import_fails() -> None:
    source = '''from openkms_functions import function, Client
import requests

@function
def execute(input: dict, client: Client) -> dict:
    return {}
'''
    valid, errors, _ = validate_function_source(source)
    assert valid is False
    assert any("requests" in e for e in errors)


def test_legacy_execute_allowed_with_warning() -> None:
    source = '''from openkms_functions import ExecuteContext

def execute(input: dict, ctx: ExecuteContext) -> dict:
    return {"ok": True}
'''
    valid, errors, warnings = validate_function_source(source)
    assert valid is True
    assert errors == []
    assert any("Legacy execute" in w for w in warnings)


def test_decorated_custom_entrypoint() -> None:
    source = '''from openkms_functions import Client, function

@function
def count_rows(input: dict, client: Client) -> dict:
    return {"count": 0}
'''
    valid, errors, _ = validate_function_source(source, entrypoint="count_rows")
    assert valid is True
    assert errors == []


def test_extract_function_uses_strings() -> None:
    source = '''from openkms_functions import Client, function

@function(uses=["helloGreeting", "otherFn"])
def execute(input: dict, client: Client) -> dict:
    return {}
'''
    assert extract_function_uses(source) == ["helloGreeting", "otherFn"]


def test_extract_function_uses_names() -> None:
    source = '''from openkms_functions import Client, function
from openkms_ontology_sdk import helloGreeting

@function(uses=[helloGreeting])
def execute(input: dict, client: Client) -> dict:
    return {}
'''
    assert extract_function_uses(source) == ["helloGreeting"]


def test_extract_function_uses_empty() -> None:
    assert extract_function_uses(DEFAULT_FUNCTION_SOURCE) == []
