"""Request temporary public document URLs from openKMS backend (Baidu file_url mode)."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlparse

import requests

from .baidu_parser import BaiduParseError

logger = logging.getLogger("openkms_cli.baidu")


def _redact_url(url: str) -> str:
    if "sig=" not in url:
        return url
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}?exp=...&sig=<redacted>"


def request_baidu_file_url(
    api_url: str,
    document_id: str,
    file_ext: str,
    *,
    auth_headers: dict[str, str] | None = None,
    basic_auth: tuple[str, str] | None = None,
    timeout: int = 30,
    session: requests.Session | None = None,
) -> str:
    """
    Call GET /internal-api/documents/{id}/baidu-fetch-url and return the public file_url.
    """
    base = (api_url or "").strip().rstrip("/")
    if not base:
        raise BaiduParseError("OPENKMS_API_URL is required for Baidu file_url upload mode")
    if not document_id:
        raise BaiduParseError("document_id is required for Baidu file_url upload mode")

    ext = file_ext.lower().lstrip(".")
    url = f"{base}/internal-api/documents/{document_id}/baidu-fetch-url"
    http = session or requests
    logger.info(
        "baidu_fetch_url request document_id=%s file_ext=%s api_host=%s",
        document_id,
        ext,
        urlparse(base).netloc,
    )
    try:
        resp = http.get(
            url,
            params={"file_ext": ext},
            headers=auth_headers or {},
            auth=basic_auth,
            timeout=timeout,
        )
    except requests.RequestException as e:
        raise BaiduParseError(f"Failed to request Baidu fetch URL: {e}") from e

    if resp.status_code != 200:
        body = (resp.text or "")[:300]
        raise BaiduParseError(
            f"Baidu fetch URL request failed HTTP {resp.status_code}: {body}"
        )

    data: dict[str, Any] = resp.json()
    file_url = data.get("url")
    if not file_url or not isinstance(file_url, str):
        raise BaiduParseError(f"Backend returned no url field: {data}")

    logger.info(
        "baidu_fetch_url ok document_id=%s file_ext=%s expires_at=%s url=%s",
        document_id,
        ext,
        data.get("expires_at"),
        _redact_url(file_url),
    )
    return file_url


def resolve_baidu_upload_mode(
    mode_setting: str,
    *,
    document_id: str | None,
    file_bytes: bytes,
    file_name: str,
) -> str:
    """
    Resolve upload mode: auto | file_data | file_url.

    auto: file_url when document_id is set; else file_data if within size limits.
    """
    from .baidu_parser import validate_file_data_size

    mode = (mode_setting or "auto").strip().lower()
    if mode not in ("auto", "file_data", "file_url"):
        raise BaiduParseError(
            f"Invalid OPENKMS_BAIDU_UPLOAD_MODE={mode_setting!r}; use auto, file_data, or file_url"
        )
    if mode == "file_data":
        return "file_data"
    if mode == "file_url":
        if not document_id:
            raise BaiduParseError(
                "Baidu file_url mode requires --document-id (and backend auth for fetch URL)"
            )
        return "file_url"
    # auto
    if document_id:
        logger.info(
            "baidu_upload_mode=auto chose file_url document_id=%s file_name=%s size=%s",
            document_id,
            file_name,
            len(file_bytes),
        )
        return "file_url"
    validate_file_data_size(file_bytes, file_name)
    logger.info(
        "baidu_upload_mode=auto chose file_data (no document_id) file_name=%s size=%s",
        file_name,
        len(file_bytes),
    )
    return "file_data"
