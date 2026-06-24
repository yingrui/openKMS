"""Decide whether a pipeline run should LLM-extract document metadata."""

from __future__ import annotations

from typing import Any


def is_metadata_value_empty(value: Any) -> bool:
    """True when a single metadata field carries no usable content."""
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, tuple, dict, set)):
        return len(value) == 0
    return False


def extraction_schema_field_keys(extraction_schema: list | dict | None) -> list[str]:
    """Field keys from channel extraction_schema (list of field defs)."""
    if isinstance(extraction_schema, dict):
        items = extraction_schema.get("fields") if isinstance(extraction_schema.get("fields"), list) else []
        if not items and "key" in extraction_schema:
            items = [extraction_schema]
    elif isinstance(extraction_schema, list):
        items = extraction_schema
    else:
        return []
    keys: list[str] = []
    for item in items:
        if isinstance(item, dict):
            key = item.get("key")
            if isinstance(key, str) and key.strip():
                keys.append(key.strip())
    return keys


def document_metadata_needs_extraction(
    doc_metadata: dict | None,
    extraction_schema: list | dict | None,
) -> bool:
    """True when schema fields are all missing or empty (pipeline should extract)."""
    meta = doc_metadata if isinstance(doc_metadata, dict) else {}
    keys = extraction_schema_field_keys(extraction_schema)
    if not keys:
        if not meta:
            return True
        return all(is_metadata_value_empty(v) for v in meta.values())
    return all(is_metadata_value_empty(meta.get(k)) for k in keys)
