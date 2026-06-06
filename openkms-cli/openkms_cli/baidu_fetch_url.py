"""Request temporary public document URLs from openKMS backend (Baidu file_url mode)."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlparse

import requests

from .baidu_parser import BaiduParseError

logger = logging.getLogger("openkms_cli.baidu")


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
        file_url,
    )
    return file_url


def _fits_baidu_file_data(file_bytes: bytes, file_name: str) -> bool:
    """True when Baidu accepts base64 file_data for this file (images 10MB, other docs 50MB)."""
    from .baidu_parser import validate_file_data_size

    try:
        validate_file_data_size(file_bytes, file_name)
        return True
    except BaiduParseError:
        return False


def resolve_baidu_upload_mode(
    mode_setting: str,
    *,
    document_id: str | None,
    file_bytes: bytes,
    file_name: str,
) -> str:
    """
    Resolve upload mode: auto | file_data | file_url.

    auto: file_data when within Baidu caps; file_url only when larger and document_id is set.
    """
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
    # auto — prefer file_data whenever Baidu allows (more reliable than Baidu fetching file_url)
    size = len(file_bytes)
    if _fits_baidu_file_data(file_bytes, file_name):
        logger.info(
            "baidu_upload_mode=auto chose file_data file_name=%s size=%s document_id=%s",
            file_name,
            size,
            document_id or "",
        )
        return "file_data"
    if document_id:
        logger.info(
            "baidu_upload_mode=auto chose file_url (exceeds file_data cap) file_name=%s size=%s document_id=%s",
            file_name,
            size,
            document_id,
        )
        return "file_url"
    raise BaiduParseError(
        f"Document too large for Baidu file_data ({size / (1024 * 1024):.1f}MB) and "
        "no document_id for file_url. Pipeline jobs always pass --document-id."
    )
