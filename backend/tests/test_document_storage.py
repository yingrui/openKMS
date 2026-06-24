"""Tests for document storage key layout and dual-read resolver."""

from unittest.mock import patch

import pytest

from app.services.documents.document_storage import (
    document_object_key,
    document_prefix,
    is_legacy_document_hash_prefix,
    legacy_document_prefix,
    normalize_logical_document_path,
    resolve_document_object_key,
    validate_file_hash,
)

_HASH = "a" * 64


def test_validate_file_hash_rejects_invalid() -> None:
    with pytest.raises(ValueError):
        validate_file_hash("not-a-hash")


def test_document_object_key() -> None:
    assert document_object_key(_HASH, "original.pdf") == f"documents/{_HASH}/original.pdf"


def test_legacy_document_prefix_detection() -> None:
    assert is_legacy_document_hash_prefix(f"{_HASH}/")
    assert not is_legacy_document_hash_prefix("documents/")


def test_normalize_logical_path_strips_hash_prefix() -> None:
    rel = normalize_logical_document_path(_HASH, f"{_HASH}/layout_det_0.png")
    assert rel == "layout_det_0.png"
    rel2 = normalize_logical_document_path(_HASH, f"documents/{_HASH}/markdown.md")
    assert rel2 == "markdown.md"


def test_resolve_prefers_new_path() -> None:
    new_key = document_object_key(_HASH, "result.json")
    with patch("app.services.documents.document_storage.object_exists", side_effect=lambda k: k == new_key):
        assert resolve_document_object_key(_HASH, "result.json") == new_key


def test_resolve_falls_back_to_legacy() -> None:
    old_key = f"{legacy_document_prefix(_HASH)}/result.json"
    with patch(
        "app.services.documents.document_storage.object_exists",
        side_effect=lambda k: k == old_key,
    ):
        assert resolve_document_object_key(_HASH, "result.json") == old_key


def test_resolve_returns_none_when_missing() -> None:
    with patch("app.services.documents.document_storage.object_exists", return_value=False):
        assert resolve_document_object_key(_HASH, "missing.bin") is None
