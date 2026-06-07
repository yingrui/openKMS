"""Backend service auth for qa-agent: OIDC client credentials or HTTP Basic (local mode).

Local mode: ``OPENKMS_QA_AGENT_BASIC_*``. OIDC: ``OPENKMS_OIDC_TOKEN_URL`` and
``OPENKMS_QA_AGENT_OIDC_CLIENT_*``. Shared with openkms-cli: ``OPENKMS_AUTH_MODE``.
"""

from __future__ import annotations

import logging
import time

import httpx

from .config import settings

logger = logging.getLogger(__name__)

_OIDC_TOKEN_ATTEMPTS = 3
_OIDC_TOKEN_TIMEOUT_SECONDS = 30.0


def _auth_error_message(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        err = body.get("error", "unknown")
        desc = body.get("error_description", "")
        hint = desc or resp.text or str(resp.status_code)
        return f"Token endpoint {err}: {hint}"
    except Exception:
        return f"Token endpoint returned {resp.status_code}"


def is_local_auth_mode() -> bool:
    return settings.auth_mode.strip().lower() == "local"


def get_access_token() -> str:
    if is_local_auth_mode():
        raise ValueError(
            "OPENKMS_AUTH_MODE=local: use HTTP Basic (OPENKMS_QA_AGENT_BASIC_USER / "
            "OPENKMS_QA_AGENT_BASIC_PASSWORD) via api_request_auth(); "
            "do not use get_access_token()"
        )

    token_url = settings.oidc_token_url.strip()
    if not token_url:
        raise ValueError(
            "OPENKMS_OIDC_TOKEN_URL is required when OPENKMS_AUTH_MODE=oidc "
            "(IdP token_endpoint from .well-known/openid-configuration)"
        )

    client_id = settings.oidc_client_id.strip() or "qa-agent"
    client_secret = settings.oidc_client_secret.strip()
    if not client_secret:
        raise ValueError(
            "OPENKMS_QA_AGENT_OIDC_CLIENT_SECRET is required for OIDC client-credentials auth"
        )

    data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }

    last_err: Exception | None = None
    for attempt in range(1, _OIDC_TOKEN_ATTEMPTS + 1):
        try:
            resp = httpx.post(token_url, data=data, timeout=_OIDC_TOKEN_TIMEOUT_SECONDS)
            if not resp.is_success:
                raise ValueError(_auth_error_message(resp))
            body = resp.json()
            access_token = body.get("access_token")
            if not access_token:
                raise ValueError("No access_token in token response")
            if attempt > 1:
                logger.info("OIDC token request succeeded on attempt %d", attempt)
            return access_token
        except ValueError:
            raise
        except httpx.HTTPError as exc:
            last_err = exc
            logger.warning(
                "OIDC token request attempt %d/%d failed (%s): %s",
                attempt,
                _OIDC_TOKEN_ATTEMPTS,
                token_url,
                exc,
            )
            if attempt < _OIDC_TOKEN_ATTEMPTS:
                time.sleep(float(attempt))
                continue
    assert last_err is not None
    raise ValueError(
        f"OIDC token request failed after {_OIDC_TOKEN_ATTEMPTS} attempts ({token_url}): {last_err}. "
        "Check the IdP (e.g. Keycloak) is running and reachable."
    ) from last_err


def api_request_auth() -> tuple[dict[str, str], tuple[str, str] | None]:
    """Return (headers, basic_auth) for httpx requests to the backend."""
    if is_local_auth_mode():
        u = settings.basic_user.strip()
        p = settings.basic_password
        if not u or not p:
            raise ValueError(
                "local auth requires OPENKMS_QA_AGENT_BASIC_USER and OPENKMS_QA_AGENT_BASIC_PASSWORD"
            )
        return {}, (u, p)
    token = get_access_token()
    return {"Authorization": f"Bearer {token}"}, None


def auth_expired_response(resp: httpx.Response) -> bool:
    if resp.status_code != 401:
        return False
    try:
        body = resp.json()
        detail = body.get("detail")
        if isinstance(detail, dict):
            return detail.get("code") in ("INVALID_OR_EXPIRED_TOKEN", "INVALID_TOKEN")
    except Exception:
        pass
    return False
