"""Tests for Baidu file_url upload mode helpers."""

from unittest.mock import MagicMock, patch

import pytest

from openkms_cli.baidu_fetch_url import (
    request_baidu_file_url,
    resolve_baidu_upload_mode,
)
from openkms_cli.baidu_parser import (
    BAIDU_AUTO_FILE_DATA_MAX_BYTES,
    BaiduParseError,
    MAX_FILE_DATA_BYTES,
)


def test_resolve_upload_mode_auto_with_document_id_small_uses_file_data():
    assert (
        resolve_baidu_upload_mode(
            "auto",
            document_id="doc-1",
            file_bytes=b"x" * 100,
            file_name="small.pdf",
        )
        == "file_data"
    )


def test_resolve_upload_mode_auto_with_document_id_over_5mb_uses_file_url():
    assert (
        resolve_baidu_upload_mode(
            "auto",
            document_id="doc-1",
            file_bytes=b"x" * (BAIDU_AUTO_FILE_DATA_MAX_BYTES + 1),
            file_name="big.pdf",
        )
        == "file_url"
    )


def test_resolve_upload_mode_auto_with_document_id_at_5mb_uses_file_data():
    assert (
        resolve_baidu_upload_mode(
            "auto",
            document_id="doc-1",
            file_bytes=b"x" * BAIDU_AUTO_FILE_DATA_MAX_BYTES,
            file_name="at-limit.pdf",
        )
        == "file_data"
    )


def test_resolve_upload_mode_auto_without_document_id_small_file():
    assert (
        resolve_baidu_upload_mode(
            "auto",
            document_id=None,
            file_bytes=b"x" * 100,
            file_name="small.pdf",
        )
        == "file_data"
    )


def test_resolve_upload_mode_file_url_requires_document_id():
    with pytest.raises(BaiduParseError, match="document-id"):
        resolve_baidu_upload_mode(
            "file_url",
            document_id=None,
            file_bytes=b"x",
            file_name="a.pdf",
        )


def test_resolve_upload_mode_auto_large_without_document_id():
    with pytest.raises(BaiduParseError, match="10MB|50MB"):
        resolve_baidu_upload_mode(
            "auto",
            document_id=None,
            file_bytes=b"x" * (MAX_FILE_DATA_BYTES + 1),
            file_name="huge.pdf",
        )


def test_request_baidu_file_url_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "url": "https://public.example/api/public/documents/d1/original.pdf?exp=9&sig=deadbeef",
        "expires_at": "2026-01-01T00:00:00Z",
        "file_ext": "pdf",
        "file_hash": "a" * 64,
    }
    with patch("openkms_cli.baidu_fetch_url.requests.get", return_value=mock_resp) as mock_get:
        url = request_baidu_file_url(
            "http://backend:8102",
            "d1",
            "pdf",
            auth_headers={"Authorization": "Bearer x"},
        )
    assert "original.pdf" in url
    mock_get.assert_called_once()
    call_url = mock_get.call_args[0][0]
    assert "/internal-api/documents/d1/baidu-fetch-url" in call_url


def test_request_baidu_file_url_http_error():
    mock_resp = MagicMock()
    mock_resp.status_code = 404
    mock_resp.text = "not found"
    with patch("openkms_cli.baidu_fetch_url.requests.get", return_value=mock_resp):
        with pytest.raises(BaiduParseError, match="404"):
            request_baidu_file_url("http://api", "missing", "pdf")
