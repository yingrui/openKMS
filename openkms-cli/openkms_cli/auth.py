"""API authentication for openkms-cli: OIDC client credentials or HTTP Basic (local auth mode)."""

import requests

from .settings import get_cli_settings


def _auth_error_message(resp: requests.Response) -> str:
    try:
        body = resp.json()
        err = body.get("error", "unknown")
        desc = body.get("error_description", "")
        hint = desc or resp.text or resp.reason or str(resp.status_code)
        return f"Token endpoint {err}: {hint}"
    except Exception:
        return f"Token endpoint returned {resp.status_code} {resp.reason}"


def is_local_auth_mode() -> bool:
    return get_cli_settings().auth_mode.strip().lower() == "local"


def get_access_token() -> str:
    """
    Obtain a Bearer token: OIDC client credentials, or minted JWT path is not used here.

    In local mode, use api_request_auth() with HTTP Basic instead; this function raises
    if called without OIDC credentials configured.
    """
    if is_local_auth_mode():
        raise ValueError(
            "OPENKMS_AUTH_MODE=local: use HTTP Basic (OPENKMS_CLI_BASIC_USER / "
            "OPENKMS_CLI_BASIC_PASSWORD) via api_request_auth(); do not use get_access_token()"
        )

    cfg = get_cli_settings()
    token_url_override = cfg.oidc_token_url.strip()
    if token_url_override:
        token_url = token_url_override
    else:
        base = cfg.oidc_auth_server_base_url.rstrip("/")
        realm = cfg.oidc_realm
        token_url = f"{base}/realms/{realm}/protocol/openid-connect/token"

    client_id = cfg.oidc_service_client_id.strip() or "openkms-cli"
    client_secret = cfg.oidc_service_client_secret.strip()

    if not client_secret:
        raise ValueError(
            "OPENKMS_OIDC_SERVICE_CLIENT_SECRET is required for OIDC client-credentials auth "
            "(or set OPENKMS_OIDC_TOKEN_URL for a non-Keycloak-style token endpoint)"
        )

    data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }

    resp = requests.post(token_url, data=data, timeout=30)
    if not resp.ok:
        raise ValueError(_auth_error_message(resp))
    body = resp.json()
    access_token = body.get("access_token")
    if not access_token:
        raise ValueError("No access_token in token response")
    return access_token


def api_request_auth() -> tuple[dict[str, str], tuple[str, str] | None]:
    """
    Build requests keyword arguments for API authentication.

    Returns:
        (headers, basic_auth). Use as requests.get(..., headers=merged, auth=basic_or_None).
    """
    cfg = get_cli_settings()
    if is_local_auth_mode():
        u = cfg.cli_basic_user.strip()
        p = cfg.cli_basic_password
        if not u or not p:
            raise ValueError(
                "OPENKMS_AUTH_MODE=local requires OPENKMS_CLI_BASIC_USER and OPENKMS_CLI_BASIC_PASSWORD"
            )
        return {}, (u, p)
    token = get_access_token()
    return {"Authorization": f"Bearer {token}"}, None


def try_api_request_auth() -> tuple[dict[str, str], tuple[str, str] | None] | None:
    """
    Like api_request_auth but returns None if OIDC creds missing or local basic not set.
    Used when pipelines may run without API access.
    """
    cfg = get_cli_settings()
    if is_local_auth_mode():
        u = cfg.cli_basic_user.strip()
        p = cfg.cli_basic_password
        if not u or not p:
            return None
        return {}, (u, p)
    try:
        return {"Authorization": f"Bearer {get_access_token()}"}, None
    except ValueError:
        return None
