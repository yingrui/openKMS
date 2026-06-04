"""HMAC-signed tokens for temporary public document fetch (e.g. Baidu file_url)."""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from urllib.parse import quote, urlencode

from app.config import settings

logger = logging.getLogger(__name__)

_TOKEN_VERSION = "v1"


def _signing_key() -> bytes:
    secret = (settings.secret_key or "").strip()
    if not secret:
        raise RuntimeError("OPENKMS_SECRET_KEY is required for document fetch tokens")
    return secret.encode("utf-8")


def build_document_fetch_token(
    document_id: str,
    file_hash: str,
    file_ext: str,
    *,
    exp_unix: int | None = None,
    ttl_seconds: int | None = None,
) -> tuple[int, str]:
    """Return (exp_unix, signature hex) for query params exp and sig."""
    ttl = ttl_seconds if ttl_seconds is not None else settings.baidu_external_fetch_ttl_seconds
    exp = exp_unix if exp_unix is not None else int(time.time()) + max(60, ttl)
    ext = file_ext.lower().lstrip(".")
    payload = f"{_TOKEN_VERSION}|{document_id}|{file_hash.lower()}|{ext}|{exp}"
    sig = hmac.new(_signing_key(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return exp, sig


def verify_document_fetch_token(
    document_id: str,
    file_hash: str,
    file_ext: str,
    *,
    exp: int,
    sig: str,
) -> bool:
    """Validate exp/sig against document_id, file_hash, and file_ext."""
    if not sig or not isinstance(exp, int) or exp <= 0:
        return False
    now = int(time.time())
    if exp < now:
        logger.debug(
            "document_fetch_token expired document_id=%s exp=%s now=%s skew=%s",
            document_id,
            exp,
            now,
            now - exp,
        )
        return False
    ext = file_ext.lower().lstrip(".")
    payload = f"{_TOKEN_VERSION}|{document_id}|{file_hash.lower()}|{ext}|{exp}"
    expected = hmac.new(_signing_key(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    ok = hmac.compare_digest(expected, sig.strip().lower())
    if not ok:
        logger.warning(
            "document_fetch_token sig mismatch document_id=%s file_hash_prefix=%s ext=%s",
            document_id,
            (file_hash or "")[:12],
            ext,
        )
    return ok


def build_public_document_fetch_url(
    document_id: str,
    file_hash: str,
    file_ext: str,
    *,
    ttl_seconds: int | None = None,
) -> tuple[str, int]:
    """Build absolute URL on OPENKMS_FRONTEND_URL for external fetchers (Baidu file_url)."""
    ext = file_ext.lower().lstrip(".")
    exp, sig = build_document_fetch_token(
        document_id, file_hash, ext, ttl_seconds=ttl_seconds
    )
    base = settings.frontend_url.rstrip("/")
    path = f"/api/public/documents/{quote(document_id, safe='')}/original.{quote(ext, safe='')}"
    qs = urlencode({"exp": str(exp), "sig": sig})
    url = f"{base}{path}?{qs}"
    logger.info(
        "document_fetch_url minted document_id=%s file_hash_prefix=%s ext=%s exp=%s host=%s",
        document_id,
        (file_hash or "")[:12],
        ext,
        exp,
        base,
    )
    return url, exp


def redact_fetch_url_for_log(url: str) -> str:
    """Log-safe URL: keep host/path, redact sig query param."""
    if "sig=" not in url:
        return url
    import re

    return re.sub(r"sig=[^&]+", "sig=<redacted>", url, count=1)
