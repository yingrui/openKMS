"""Canonical document parse result (result.json) models and validation.

Schema: openkms-cli/schemas/document_parse_result.schema.json
All parse pipelines (paddleocr-doc-parse, baidu-doc-parse, …) should emit this shape.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

_SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schemas" / "document_parse_result.schema.json"


class ParseResultValidationError(ValueError):
    """Raised when a parse result dict does not match the canonical schema."""


class ParsingBlock(BaseModel):
    model_config = ConfigDict(extra="allow")

    label: str
    content: str
    bbox: list[float] = Field(default_factory=list)
    image_path: str | None = None

    @field_validator("bbox")
    @classmethod
    def _bbox_len(cls, v: list[float]) -> list[float]:
        if len(v) not in (0, 4):
            raise ValueError("bbox must have 0 or 4 numbers")
        return v


class LayoutBox(BaseModel):
    model_config = ConfigDict(extra="allow")

    cls_id: int | None = None
    label: str | None = None
    score: float | None = None
    coordinate: list[float] | None = None
    bbox: list[float] | None = None
    content: str | None = None
    order: int | None = None
    polygon_points: list[list[float]] | None = None
    block_index: int | None = None


class LayoutPageImage(BaseModel):
    model_config = ConfigDict(extra="allow")

    layout_id: str | None = None
    path: str | None = None
    position: list[float] | None = None


class LayoutPage(BaseModel):
    model_config = ConfigDict(extra="allow")

    page_index: int | None = None
    boxes: list[LayoutBox] = Field(default_factory=list)
    input_img: str | None = None
    input_path: str | None = None
    text: str | None = None
    width: int | float | None = None
    height: int | float | None = None
    images: list[LayoutPageImage] | None = None


class DocumentParseResult(BaseModel):
    model_config = ConfigDict(extra="allow")

    file_hash: str = Field(min_length=64, max_length=64, pattern=r"^[a-f0-9]{64}$")
    parsing_res_list: list[ParsingBlock] = Field(default_factory=list)
    layout_det_res: list[LayoutPage] = Field(default_factory=list)
    markdown: str = ""
    page_count: int = Field(ge=0)
    width: int | float | None = None
    height: int | float | None = None
    parser: str | None = None
    baidu_file_id: str | None = None
    baidu_file_name: str | None = None


def schema_path() -> Path:
    """Path to document_parse_result.schema.json in the repo."""
    return _SCHEMA_PATH


def load_schema() -> dict[str, Any]:
    return json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))


def validate_parse_result(data: dict[str, Any]) -> dict[str, Any]:
    """
    Validate and normalize a parse result dict.

    Returns a dict suitable for result.json serialization.
    Raises ParseResultValidationError on invalid input.
    """
    try:
        model = DocumentParseResult.model_validate(data)
    except Exception as e:
        raise ParseResultValidationError(str(e)) from e
    return model.model_dump(mode="python")


def empty_parse_result(file_hash: str) -> dict[str, Any]:
    """Minimal valid result when parsing yields no content."""
    return validate_parse_result(
        {
            "file_hash": file_hash,
            "parsing_res_list": [],
            "layout_det_res": [],
            "markdown": "",
            "page_count": 0,
        }
    )
