"""Unit tests for S3 parse cache helpers (run_pipeline skip path)."""

from app.jobs.tasks import (
    _metadata_extraction_requested,
    _needs_metadata_extraction_after_parse_cache,
    _s3_parse_cache_usable,
)
from app.services.pipeline_metadata_state import document_metadata_needs_extraction

SCHEMA = [{"key": "abstract", "type": "string"}, {"key": "tags", "type": "array"}]


def test_s3_parse_cache_usable_with_blocks():
    assert _s3_parse_cache_usable({"parsing_res_list": [{"label": "x", "content": "y"}]}) is True


def test_s3_parse_cache_usable_with_markdown_only():
    assert _s3_parse_cache_usable({"markdown": "# Hello"}) is True


def test_s3_parse_cache_usable_spreadsheet_rejected():
    assert _s3_parse_cache_usable({"document_kind": "spreadsheet", "sheets": []}) is False


def test_s3_parse_cache_usable_empty():
    assert _s3_parse_cache_usable({}) is False


def test_metadata_extraction_requested():
    assert _metadata_extraction_requested("openkms-cli pipeline run --extract-metadata") is True
    assert _metadata_extraction_requested("openkms-cli pipeline run") is False


def test_needs_metadata_when_db_fields_empty():
    cmd = "pipeline run --extract-metadata --document-id x"
    assert _needs_metadata_extraction_after_parse_cache(cmd, {}, SCHEMA) is True
    assert _needs_metadata_extraction_after_parse_cache(cmd, {"abstract": "", "tags": []}, SCHEMA) is True


def test_needs_metadata_false_when_db_has_values():
    cmd = "pipeline run --extract-metadata --document-id x"
    assert (
        _needs_metadata_extraction_after_parse_cache(cmd, {"abstract": "ok", "tags": []}, SCHEMA)
        is False
    )


def test_needs_metadata_false_without_flag():
    assert _needs_metadata_extraction_after_parse_cache("pipeline run", {}, SCHEMA) is False


def test_document_metadata_needs_extraction_partial():
    assert document_metadata_needs_extraction({"tags": ["x"]}, SCHEMA) is False
