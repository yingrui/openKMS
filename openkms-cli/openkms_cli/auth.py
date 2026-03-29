"""API authentication for openkms-cli: OIDC client credentials or HTTP Basic (local auth mode)."""
import os

import requests


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
    return os.environ.get("OPENKMS_AUTH_MODE", "").strip().lower() == "local"


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

    url = os.environ.get("AUTH_URL", "http://localhost:8081").rstrip("/")
    realm = os.environ.get("AUTH_REALM", "openkms")
    client_id = os.environ.get("AUTH_CLIENT_ID", "")
    client_secret = os.environ.get("AUTH_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        raise ValueError("AUTH_CLIENT_ID and AUTH_CLIENT_SECRET are required for OIDC authentication")

    token_url = f"{url}/realms/{realm}/protocol/openid-connect/token"
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
    if is_local_auth_mode():
        u = os.environ.get("OPENKMS_CLI_BASIC_USER", "").strip()
        p = os.environ.get("OPENKMS_CLI_BASIC_PASSWORD", "")
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
    if is_local_auth_mode():
        u = os.environ.get("OPENKMS_CLI_BASIC_USER", "").strip()
        p = os.environ.get("OPENKMS_CLI_BASIC_PASSWORD", "")
        if not u or not p:
            return None
        return {}, (u, p)
    try:
        return {"Authorization": f"Bearer {get_access_token()}"}, None
    except ValueError:
        return None
