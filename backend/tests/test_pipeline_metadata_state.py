"""Pipeline metadata empty-check helpers."""

from app.services.pipeline_metadata_state import (
    document_metadata_needs_extraction,
    is_metadata_value_empty,
)

SCHEMA = [
    {"key": "abstract", "label": "Abstract", "type": "string"},
    {"key": "tags", "label": "Tags", "type": "array"},
]


def test_is_metadata_value_empty():
    assert is_metadata_value_empty(None) is True
    assert is_metadata_value_empty("") is True
    assert is_metadata_value_empty("  ") is True
    assert is_metadata_value_empty([]) is True
    assert is_metadata_value_empty({}) is True
    assert is_metadata_value_empty("hello") is False
    assert is_metadata_value_empty(["a"]) is False


def test_needs_extraction_when_all_schema_fields_empty():
    assert document_metadata_needs_extraction({}, SCHEMA) is True
    assert document_metadata_needs_extraction({"abstract": "", "tags": []}, SCHEMA) is True
    assert document_metadata_needs_extraction(None, SCHEMA) is True


def test_skips_extraction_when_any_schema_field_has_value():
    assert document_metadata_needs_extraction({"abstract": "Summary", "tags": []}, SCHEMA) is False
    assert document_metadata_needs_extraction({"abstract": "", "tags": ["insurance"]}, SCHEMA) is False
