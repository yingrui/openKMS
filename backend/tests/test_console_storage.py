"""Tests for console object storage helpers."""

from unittest.mock import patch

import pytest

from app.services.storage import create_folder_placeholder, validate_folder_name


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
