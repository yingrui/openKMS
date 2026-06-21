"""Tests for console object storage helpers."""

from unittest.mock import patch

import pytest

from app.services.storage import (
    create_folder_placeholder,
    prefix_destination_under_parent,
    prefix_folder_basename,
    validate_folder_name,
)


def test_validate_folder_name_rejects_slashes() -> None:
    with pytest.raises(ValueError, match="slashes"):
        validate_folder_name("a/b")
    with pytest.raises(ValueError, match="required"):
        validate_folder_name("  ")


@patch("app.services.storage.upload_object")
@patch("app.services.storage.object_exists", return_value=False)
def test_create_folder_placeholder_uploads_marker(_exists, upload) -> None:
    key = create_folder_placeholder("documents/", "reports")
    assert key == "documents/reports/"
    upload.assert_called_once_with(key, b"", content_type="application/x-directory")


@patch("app.services.storage.object_exists", return_value=True)
def test_create_folder_placeholder_rejects_duplicate(_exists) -> None:
    with pytest.raises(ValueError, match="already exists"):
        create_folder_placeholder("", "foo")


def test_prefix_destination_under_parent_keeps_folder_name() -> None:
    dest = prefix_destination_under_parent(
        "documents/",
        "9014a1ebd5cda10fb74e61abdf4c6e01bf241f1a52e5e9a133b01512251fc549/",
    )
    assert dest == "documents/9014a1ebd5cda10fb74e61abdf4c6e01bf241f1a52e5e9a133b01512251fc549/"


def test_prefix_destination_under_parent_accepts_parent_without_trailing_slash() -> None:
    dest = prefix_destination_under_parent("documents", "hash/")
    assert dest == "documents/hash/"


def test_prefix_folder_basename() -> None:
    assert prefix_folder_basename("documents/abc/") == "abc"

