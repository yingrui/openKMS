"""Auth headers for worker / scheduler calls to ``/internal-api``."""

from __future__ import annotations

import logging
import time

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_oidc_token_cache: str | None = None
_oidc_token_expires_at: float = 0.0


def _resolve_oidc_token_url() -> str:
    explicit = (settings.oidc_token_url or "").strip()
    if explicit:
        return explicit
    from app.oidc_discovery import get_oidc_provider_metadata

    meta = get_oidc_provider_metadata()
    token_ep = meta.get("token_endpoint")
    if isinstance(token_ep, str) and token_ep.strip():
        return token_ep.strip()
    raise ValueError(
        "OPENKMS_OIDC_TOKEN_URL is unset and IdP metadata has no token_endpoint"
    )


def _fetch_oidc_client_credentials_token() -> str:
    global _oidc_token_cache, _oidc_token_expires_at

    now = time.time()
    if _oidc_token_cache and now < _oidc_token_expires_at - 30:
        return _oidc_token_cache

    client_id = (settings.worker_oidc_client_id or "").strip()
    client_secret = (settings.worker_oidc_client_secret or "").strip()
    if not client_id or not client_secret:
        raise ValueError(
            "OPENKMS_WORKER_OIDC_CLIENT_ID and OPENKMS_WORKER_OIDC_CLIENT_SECRET are "
            "required for worker/scheduler internal API auth when OPENKMS_AUTH_MODE=oidc"
        )

    token_url = _resolve_oidc_token_url()
    data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }
    with httpx.Client(timeout=30.0) as client:
        response = client.post(token_url, data=data)
    if response.status_code >= 400:
        raise ValueError(f"OIDC token request failed: HTTP {response.status_code} {response.text[:200]}")

    body = response.json()
    access_token = body.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise ValueError("OIDC token response missing access_token")

    expires_in = body.get("expires_in", 300)
    try:
        ttl = max(60, int(expires_in))
    except (TypeError, ValueError):
        ttl = 300

    _oidc_token_cache = access_token
    _oidc_token_expires_at = now + ttl
    return access_token


def build_internal_service_request_auth() -> tuple[dict[str, str], httpx.BasicAuth | None]:
    """Return ``(headers, basic_auth)`` for httpx requests to ``/internal-api``."""
    if settings.auth_mode == "local":
        if settings.worker_basic_user and settings.worker_basic_password:
            return {}, httpx.BasicAuth(settings.worker_basic_user, settings.worker_basic_password)
        raise ValueError(
            "OPENKMS_WORKER_BASIC_USER and OPENKMS_WORKER_BASIC_PASSWORD are required "
            "for worker/scheduler internal API auth when OPENKMS_AUTH_MODE=local"
        )

    token = _fetch_oidc_client_credentials_token()
    return {"Authorization": f"Bearer {token}"}, None


def reset_oidc_token_cache_for_tests() -> None:
    global _oidc_token_cache, _oidc_token_expires_at
    _oidc_token_cache = None
    _oidc_token_expires_at = 0.0
