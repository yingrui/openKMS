"""Tests for Baidu BOS staging helpers."""

from unittest.mock import MagicMock, patch

import pytest

from openkms_cli.baidu_bos import (
    build_bos_object_key,
    generate_bos_presigned_url,
    stage_file_on_bos,
    validate_baidu_upload_size,
)
from openkms_cli.baidu_parser import BaiduParseError, BAIDU_MAX_FILE_URL_BYTES


def test_build_bos_object_key_short():
    key = build_bos_object_key("a" * 64, "pdf", "openkms-temp")
    assert key == f"openkms-temp/{('a' * 64)[:16]}.pdf"
    assert len(key) < 40


def test_validate_baidu_upload_size_pdf_at_limit_ok():
    validate_baidu_upload_size(b"x" * (100 * 1024 * 1024), "doc.pdf")


def test_validate_baidu_upload_size_pdf_over_limit():
    with pytest.raises(BaiduParseError, match="100MB"):
        validate_baidu_upload_size(b"x" * (100 * 1024 * 1024 + 1), "doc.pdf")


def test_validate_baidu_upload_size_image_over_limit():
    with pytest.raises(BaiduParseError, match="10MB"):
        validate_baidu_upload_size(b"x" * (11 * 1024 * 1024), "photo.jpg")


@patch("openkms_cli.baidu_bos._make_bos_client")
@patch("openkms_cli.baidu_bos._bos_settings")
def test_stage_file_on_bos_upload_and_presign(mock_settings, mock_client_factory):
    mock_settings.return_value = ("my-bucket", "bj.bcebos.com", "tmp", 3600, "ak", "sk")
    client = MagicMock()
    mock_client_factory.return_value = client
    long_auth = "a" * 200
    client.generate_pre_signed_url.return_value = (
        f"https://my-bucket.bj.bcebos.com/tmp/abcd1234.pdf?authorization={long_auth}"
    )

    key, url = stage_file_on_bos(b"%PDF", "abcd1234" + "0" * 56, "pdf", "doc.pdf")

    assert key == "tmp/abcd123400000000.pdf"
    client.put_object_from_string.assert_called_once()
    assert "authorization=" in url
    assert len(url.encode("utf-8")) <= BAIDU_MAX_FILE_URL_BYTES


@patch("openkms_cli.baidu_bos._make_bos_client")
@patch("openkms_cli.baidu_bos._bos_settings")
def test_generate_bos_presigned_url_rejects_too_long(mock_settings, mock_client_factory):
    mock_settings.return_value = ("b", "bj.bcebos.com", "p", 3600, "ak", "sk")
    client = MagicMock()
    mock_client_factory.return_value = client
    client.generate_pre_signed_url.return_value = "https://x/" + ("a" * BAIDU_MAX_FILE_URL_BYTES)

    with pytest.raises(BaiduParseError, match="exceeds"):
        generate_bos_presigned_url("p/key.pdf")


def test_bos_settings_requires_iam_credentials():
    mock_s = MagicMock(
        baidu_bos_bucket="b",
        baidu_bos_endpoint="bj.bcebos.com",
        baidu_bos_prefix="tmp",
        baidu_bos_presign_ttl_seconds=3600,
        baidu_bos_access_key="",
        baidu_bos_secret_key="",
    )
    with patch("openkms_cli.settings.get_cli_settings", return_value=mock_s):
        from openkms_cli.baidu_bos import _bos_settings

        with pytest.raises(BaiduParseError, match="BOS_ACCESS_KEY"):
            _bos_settings()


def test_bos_error_message_signature_mismatch():
    from openkms_cli.baidu_bos import _bos_error_message

    msg = _bos_error_message(
        Exception("The request signature we calculated does not match the signature you provided"),
        operation="upload",
        bucket="b",
        key="k",
    )
    assert "IAM Access Key" in msg
    assert "OCR API Key" in msg


def test_normalize_bos_presigned_url_decodes_bytes_and_upgrades_https():
    from openkms_cli.baidu_bos import _normalize_bos_presigned_url

    raw = b"http://openkms.bj.bcebos.com/openkms-temp/a.pdf?authorization=bce-auth-v1%2Fx"
    url = _normalize_bos_presigned_url(raw)
    assert url.startswith("https://openkms.bj.bcebos.com/")
    assert "authorization=" in url
    assert not url.startswith("b'")
