"""Tests for document parse result schema and validation."""

import json
from pathlib import Path

import pytest

from openkms_cli.parse_result import (
    ParseResultValidationError,
    empty_parse_result,
    load_schema,
    schema_path,
    validate_parse_result,
)

_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "document_parse_result_minimal.json"


def _load_fixture() -> dict:
    return json.loads(_FIXTURE.read_text(encoding="utf-8"))


def test_schema_file_exists():
    assert schema_path().is_file()
    schema = load_schema()
    assert schema["title"] == "DocumentParseResult"
    assert "file_hash" in schema["required"]


def test_fixture_paddleocr_shape_validates():
    data = _load_fixture()
    out = validate_parse_result(data)
    assert out["file_hash"] == data["file_hash"]
    assert out["page_count"] == 3
    assert len(out["parsing_res_list"]) == 21
    assert len(out["layout_det_res"]) == 3
    labels = {b["label"] for b in out["parsing_res_list"]}
    assert {"header_image", "header", "footer", "chart", "table", "display_formula", "abstract", "footnote", "number"} <= labels
    assert out["layout_det_res"][0]["input_img"]
    assert out["layout_det_res"][1]["page_index"] == 1
    assert any(b.get("image_path") for b in out["parsing_res_list"])
    assert out["markdown"].startswith("# Sample research paper title")


def test_empty_parse_result():
    h = "a" * 64
    out = empty_parse_result(h)
    assert out["file_hash"] == h
    assert out["page_count"] == 0
    assert out["markdown"] == ""


def test_invalid_file_hash_rejected():
    with pytest.raises(ParseResultValidationError):
        validate_parse_result(
            {
                "file_hash": "not-a-hash",
                "parsing_res_list": [],
                "layout_det_res": [],
                "markdown": "",
                "page_count": 0,
            }
        )


def test_baidu_minimal_result_validates():
    h = "b" * 64
    out = validate_parse_result(
        {
            "file_hash": h,
            "parsing_res_list": [{"label": "doc_title", "content": "Title", "bbox": [0, 0, 10, 10]}],
            "layout_det_res": [
                {
                    "page_index": 0,
                    "boxes": [{"label": "doc_title", "bbox": [0, 0, 10, 10], "content": "Title"}],
                    "text": "Title",
                    "width": 612,
                    "height": 792,
                }
            ],
            "markdown": "# Title",
            "page_count": 1,
            "parser": "baidu-cloud-paddle-vl",
            "baidu_file_id": "file-1",
        }
    )
    assert out["parser"] == "baidu-cloud-paddle-vl"


def test_fixture_validates_against_json_schema_file():
    jsonschema = pytest.importorskip("jsonschema")
    jsonschema.validate(instance=_load_fixture(), schema=load_schema())
