"""Stage documents on Baidu BOS for paddle-vl-parser ``file_url`` submit."""

from __future__ import annotations

import logging
import time
from typing import Callable

from .baidu_parser import BAIDU_MAX_FILE_URL_BYTES, BaiduParseError

logger = logging.getLogger("openkms_cli.baidu")

# Baidu PaddleOCR-VL file_url size limits (bytes).
MAX_FILE_URL_PDF_BYTES = 100 * 1024 * 1024
MAX_FILE_URL_OTHER_BYTES = 50 * 1024 * 1024
MAX_IMAGE_BYTES = 10 * 1024 * 1024

_BAIDU_IMAGE_EXT = frozenset({".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"})
_BAIDU_LAYOUT_EXT = frozenset({".pdf", ".ofd"})
_BOS_UPLOAD_RETRIES = 3
_BOS_UPLOAD_BACKOFF_SEC = (2, 5, 10)


def _bos_settings() -> tuple[str, str, str, int, str, str]:
    from .settings import get_cli_settings

    s = get_cli_settings()
    bucket = (getattr(s, "baidu_bos_bucket", "") or "").strip()
    endpoint = (getattr(s, "baidu_bos_endpoint", "") or "bj.bcebos.com").strip()
    prefix = (getattr(s, "baidu_bos_prefix", "") or "openkms-temp").strip().strip("/")
    ttl = getattr(s, "baidu_bos_presign_ttl_seconds", 3600)
    ak = (getattr(s, "baidu_bos_access_key", "") or "").strip()
    sk = (getattr(s, "baidu_bos_secret_key", "") or "").strip()
    if not bucket:
        raise BaiduParseError(
            "OPENKMS_BAIDU_BOS_BUCKET is required for baidu-doc-parse "
            "(private BOS bucket for temporary staging)."
        )
    if not ak or not sk:
        raise BaiduParseError(
            "OPENKMS_BAIDU_BOS_ACCESS_KEY and OPENKMS_BAIDU_BOS_SECRET_KEY are required. "
            "BOS uses IAM Access Key (控制台 → 安全认证 → Access Key), "
            "not the OCR API Key (OPENKMS_BAIDU_CLOUD_API_KEY)."
        )
    return bucket, endpoint, prefix, ttl, ak, sk


def _normalize_bos_endpoint(endpoint: str) -> str:
    """BOS SDK expects regional host; official examples use http://bj.bcebos.com."""
    host = endpoint.strip().rstrip("/")
    if host.startswith("http://") or host.startswith("https://"):
        return host
    return f"http://{host}"


def _make_bos_client(access_key: str, secret_key: str, endpoint: str):
    try:
        from baidubce.auth.bce_credentials import BceCredentials
        from baidubce.bce_client_configuration import BceClientConfiguration
        from baidubce.services.bos.bos_client import BosClient
    except ImportError as e:
        raise BaiduParseError(
            "baidu-doc-parse requires bce-python-sdk. "
            "Install with: pip install 'openkms-cli[baidu]'"
        ) from e

    config = BceClientConfiguration(
        credentials=BceCredentials(access_key, secret_key),
        endpoint=_normalize_bos_endpoint(endpoint),
        connection_timeout_in_mills=120_000,
    )
    return BosClient(config)


def _bos_error_message(err: BaseException, *, operation: str, bucket: str, key: str) -> str:
    msg = str(err).lower()
    if "signature" in msg and "does not match" in msg:
        return (
            f"Baidu BOS {operation} failed: Access Key / Secret Key signature rejected. "
            "Use IAM Access Key (OPENKMS_BAIDU_BOS_ACCESS_KEY / OPENKMS_BAIDU_BOS_SECRET_KEY), "
            "not the OCR API Key (OPENKMS_BAIDU_CLOUD_API_KEY)."
        )
    if "access denied" in msg or "not authorized" in msg or "403" in msg:
        return (
            f"Baidu BOS {operation} denied for bucket={bucket} key={key}. "
            "Grant the IAM user PutObject, GetObject, and DeleteObject on this bucket."
        )
    if "nosuchbucket" in msg.replace("_", "").replace("-", ""):
        return (
            f"Baidu BOS bucket {bucket!r} not found. "
            "Check OPENKMS_BAIDU_BOS_BUCKET and OPENKMS_BAIDU_BOS_ENDPOINT region."
        )
    return f"Baidu BOS {operation} failed (bucket={bucket} key={key}): {err}"


def max_file_url_bytes_for_suffix(suffix: str) -> int:
    suf = suffix.lower()
    if suf in _BAIDU_IMAGE_EXT:
        return MAX_IMAGE_BYTES
    if suf in _BAIDU_LAYOUT_EXT:
        return MAX_FILE_URL_PDF_BYTES
    return MAX_FILE_URL_OTHER_BYTES


def validate_baidu_upload_size(file_bytes: bytes, file_name: str) -> None:
    """Reject files that exceed Baidu file_url limits for paddle-vl-parser."""
    from pathlib import Path

    suffix = Path(file_name).suffix.lower()
    limit = max_file_url_bytes_for_suffix(suffix)
    size = len(file_bytes)
    if size <= limit:
        return
    size_mb = size / (1024 * 1024)
    limit_mb = limit / (1024 * 1024)
    if suffix in _BAIDU_IMAGE_EXT:
        raise BaiduParseError(
            f"Image too large for baidu-doc-parse ({size_mb:.1f}MB > {limit_mb:.0f}MB). "
            f"Baidu file_url limit for images is 10MB."
        )
    if suffix in _BAIDU_LAYOUT_EXT:
        raise BaiduParseError(
            f"Document too large for baidu-doc-parse ({size_mb:.1f}MB > {limit_mb:.0f}MB). "
            f"Baidu file_url limit for PDF/OFD is 100MB."
        )
    raise BaiduParseError(
        f"Document too large for baidu-doc-parse ({size_mb:.1f}MB > {limit_mb:.0f}MB). "
        f"Baidu file_url limit is 50MB for this file type."
    )


def build_bos_object_key(file_hash: str, file_ext: str, prefix: str) -> str:
    """Short object key to keep presigned URL under Baidu's 1024-byte file_url cap."""
    ext = file_ext.lower().lstrip(".") or "bin"
    p = prefix.strip().strip("/")
    name = f"{file_hash[:16]}.{ext}"
    return f"{p}/{name}" if p else name


def _ensure_file_url_length(url: str) -> None:
    url_len = len(url.encode("utf-8"))
    if url_len > BAIDU_MAX_FILE_URL_BYTES:
        raise BaiduParseError(
            f"Baidu BOS presigned URL exceeds {BAIDU_MAX_FILE_URL_BYTES} bytes ({url_len}). "
            f"Use a shorter OPENKMS_BAIDU_BOS_PREFIX or bucket name."
        )


def upload_bytes_to_bos(
    file_bytes: bytes,
    *,
    key: str,
    content_type: str = "application/octet-stream",
) -> None:
    bucket, endpoint, _, _, ak, sk = _bos_settings()
    logger.info(
        "baidu_bos_upload bucket=%s key=%s size=%s endpoint=%s",
        bucket,
        key,
        len(file_bytes),
        _normalize_bos_endpoint(endpoint).split("://")[-1][:40],
    )
    last_err: BaseException | None = None
    for attempt in range(_BOS_UPLOAD_RETRIES):
        client = _make_bos_client(ak, sk, endpoint)
        try:
            client.put_object_from_string(bucket, key, file_bytes, content_type=content_type)
            logger.info("baidu_bos_upload ok bucket=%s key=%s", bucket, key)
            return
        except Exception as e:
            last_err = e
            if attempt + 1 >= _BOS_UPLOAD_RETRIES:
                break
            wait = _BOS_UPLOAD_BACKOFF_SEC[min(attempt, len(_BOS_UPLOAD_BACKOFF_SEC) - 1)]
            logger.warning(
                "baidu_bos_upload error attempt=%s/%s wait=%ss err=%s",
                attempt + 1,
                _BOS_UPLOAD_RETRIES,
                wait,
                e,
            )
            time.sleep(wait)
    raise BaiduParseError(
        _bos_error_message(last_err or RuntimeError("unknown"), operation="upload", bucket=bucket, key=key)
    ) from last_err


def _normalize_bos_presigned_url(url: bytes | str) -> str:
    """BOS SDK returns bytes; Baidu file_url requires a plain https URL string."""
    if isinstance(url, bytes):
        url = url.decode("utf-8")
    else:
        url = str(url).strip()
    if url.startswith("http://"):
        url = "https://" + url[len("http://") :]
    return url


def generate_bos_presigned_url(key: str, *, ttl_seconds: int | None = None) -> str:
    bucket, endpoint, _, default_ttl, ak, sk = _bos_settings()
    ttl = default_ttl if ttl_seconds is None else ttl_seconds
    client = _make_bos_client(ak, sk, endpoint)
    try:
        from baidubce import protocol

        raw_url = client.generate_pre_signed_url(
            bucket,
            key,
            expiration_in_seconds=ttl,
            protocol=protocol.HTTPS,
        )
    except Exception as e:
        raise BaiduParseError(
            _bos_error_message(e, operation="presign", bucket=bucket, key=key)
        ) from e
    url = _normalize_bos_presigned_url(raw_url)
    _ensure_file_url_length(url)
    logger.info(
        "baidu_bos_presign bucket=%s key=%s ttl=%ss url_len=%s",
        bucket,
        key,
        ttl,
        len(url.encode("utf-8")),
    )
    return url


def delete_bos_object(key: str) -> None:
    bucket, endpoint, _, _, ak, sk = _bos_settings()
    client = _make_bos_client(ak, sk, endpoint)
    try:
        client.delete_object(bucket, key)
    except Exception as e:
        raise BaiduParseError(
            _bos_error_message(e, operation="delete", bucket=bucket, key=key)
        ) from e
    logger.info("baidu_bos_delete bucket=%s key=%s", bucket, key)


def stage_file_on_bos(
    file_bytes: bytes,
    file_hash: str,
    file_ext: str,
    file_name: str,
) -> tuple[str, str]:
    """
    Upload bytes to BOS and return ``(object_key, presigned_get_url)``.

    Caller must delete ``object_key`` when done (see ``cleanup_bos_object``).
    """
    validate_baidu_upload_size(file_bytes, file_name)
    _, _, prefix, _, _, _ = _bos_settings()
    key = build_bos_object_key(file_hash, file_ext, prefix)
    upload_bytes_to_bos(file_bytes, key=key)
    url = generate_bos_presigned_url(key)
    return key, url


def cleanup_bos_object(key: str) -> None:
    """Best-effort delete of a staged BOS object."""
    try:
        delete_bos_object(key)
    except Exception as e:
        logger.warning("baidu_bos_cleanup failed key=%s err=%s", key, e)


def make_presign_refresher(key: str) -> Callable[[], str]:
    """Return a callable that mints a fresh presigned URL for an existing object."""

    def refresh() -> str:
        return generate_bos_presigned_url(key)

    return refresh
