"""Backend service auth for qa-agent: OIDC client credentials or HTTP Basic (local mode).

Same contract as ``openkms-cli`` — local mode uses ``OPENKMS_CLI_BASIC_*``; OIDC uses
``OPENKMS_QA_AGENT_OIDC_CLIENT_*`` (or ``OPENKMS_OIDC_TOKEN_URL``).
"""

from __future__ import annotations

import httpx

from .config import settings


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
            "OPENKMS_QA_AGENT_AUTH_MODE=local: use HTTP Basic (OPENKMS_QA_AGENT_BASIC_USER / "
            "OPENKMS_QA_AGENT_BASIC_PASSWORD; compatibility: OPENKMS_CLI_BASIC_*) via api_request_auth(); "
            "do not use get_access_token()"
        )

    token_url_override = settings.oidc_token_url.strip()
    if token_url_override:
        token_url = token_url_override
    else:
        base = settings.oidc_auth_server_base_url.rstrip("/")
        realm = settings.oidc_realm
        token_url = f"{base}/realms/{realm}/protocol/openid-connect/token"

    client_id = settings.oidc_client_id.strip() or "qa-agent"
    client_secret = settings.oidc_client_secret.strip()
    if not client_secret:
        raise ValueError(
            "OPENKMS_QA_AGENT_OIDC_CLIENT_SECRET is required for OIDC client-credentials auth "
            "(or set OPENKMS_QA_AGENT_OIDC_TOKEN_URL / OPENKMS_OIDC_TOKEN_URL)"
        )

    data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }
    resp = httpx.post(token_url, data=data, timeout=30.0)
    if not resp.is_success:
        raise ValueError(_auth_error_message(resp))
    body = resp.json()
    access_token = body.get("access_token")
    if not access_token:
        raise ValueError("No access_token in token response")
    return access_token


def api_request_auth() -> tuple[dict[str, str], tuple[str, str] | None]:
    """Return (headers, basic_auth) for httpx requests to the backend."""
    if is_local_auth_mode():
        u = settings.cli_basic_user.strip()
        p = settings.cli_basic_password
        if not u or not p:
            raise ValueError(
                "local auth requires OPENKMS_QA_AGENT_BASIC_USER and OPENKMS_QA_AGENT_BASIC_PASSWORD "
                "(compatibility aliases: OPENKMS_CLI_BASIC_USER / OPENKMS_CLI_BASIC_PASSWORD)"
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
