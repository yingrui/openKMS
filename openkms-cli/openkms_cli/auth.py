"""Keycloak client credentials authentication for openkms-cli."""
import os

import requests


def _auth_error_message(resp: requests.Response) -> str:
    """Build a helpful error message from Keycloak's token response."""
    try:
        body = resp.json()
        err = body.get("error", "unknown")
        desc = body.get("error_description", "")
        hint = desc or resp.text or resp.reason or str(resp.status_code)
        return f"Keycloak {err}: {hint}"
    except Exception:
        return f"Keycloak returned {resp.status_code} {resp.reason}"


def get_access_token() -> str:
    """
    Obtain an access token from Keycloak via client credentials flow.

    Uses env vars: AUTH_URL, AUTH_REALM, AUTH_CLIENT_ID, AUTH_CLIENT_SECRET.

    Returns:
        JWT access token for Authorization: Bearer.

    Raises:
        ValueError: If required env vars are missing or token request fails.
    """
    url = os.environ.get("AUTH_URL", "http://localhost:8081").rstrip("/")
    realm = os.environ.get("AUTH_REALM", "openkms")
    client_id = os.environ.get("AUTH_CLIENT_ID", "")
    client_secret = os.environ.get("AUTH_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        raise ValueError("AUTH_CLIENT_ID and AUTH_CLIENT_SECRET are required for authentication")

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
        raise ValueError("No access_token in Keycloak response")
    return access_token
