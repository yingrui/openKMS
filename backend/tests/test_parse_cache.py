"""Unit tests for S3 parse cache helpers (run_pipeline skip path)."""

from app.jobs.tasks import _s3_parse_cache_usable


def test_s3_parse_cache_usable_with_blocks():
    assert _s3_parse_cache_usable({"parsing_res_list": [{"label": "x", "content": "y"}]}) is True


def test_s3_parse_cache_usable_with_markdown_only():
    assert _s3_parse_cache_usable({"markdown": "# Hello"}) is True


def test_s3_parse_cache_usable_spreadsheet_rejected():
    assert _s3_parse_cache_usable({"document_kind": "spreadsheet", "sheets": []}) is False


def test_s3_parse_cache_usable_empty():
    assert _s3_parse_cache_usable({}) is False
