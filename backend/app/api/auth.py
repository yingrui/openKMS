"""OAuth2 Keycloak authentication API."""

import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Request, Response
from fastapi.responses import RedirectResponse
from app.config import settings

router = APIRouter(tags=["auth"])

_KEYCLOAK_AUTH = "{base}/realms/{realm}/protocol/openid-connect/auth"
_KEYCLOAK_TOKEN = "{base}/realms/{realm}/protocol/openid-connect/token"
_KEYCLOAK_LOGOUT = "{base}/realms/{realm}/protocol/openid-connect/logout"


def _auth_url() -> str:
    base = settings.keycloak_auth_server_url.rstrip("/")
    return _KEYCLOAK_AUTH.format(base=base, realm=settings.keycloak_realm)


def _token_url() -> str:
    base = settings.keycloak_auth_server_url.rstrip("/")
    return _KEYCLOAK_TOKEN.format(base=base, realm=settings.keycloak_realm)


def _logout_url() -> str:
    base = settings.keycloak_auth_server_url.rstrip("/")
    return _KEYCLOAK_LOGOUT.format(base=base, realm=settings.keycloak_realm)


@router.get("/login")
async def login(request: Request) -> RedirectResponse:
    """Redirect to Keycloak authorization endpoint."""
    state = secrets.token_urlsafe(32)
    request.session["oauth_state"] = state

    params = {
        "client_id": settings.keycloak_client_id,
        "redirect_uri": settings.keycloak_redirect_uri,
        "response_type": "code",
        "scope": "openid",
        "state": state,
    }

    url = f"{_auth_url()}?{urlencode(params)}"
    return RedirectResponse(url=url, status_code=302)


@router.get("/login/oauth2/code/keycloak")
async def oauth2_callback(
    request: Request,
    response: Response,
    code: str = "",
    state: str = "",
) -> RedirectResponse:
    """Exchange authorization code for tokens. Keycloak redirects here after login."""
    import httpx

    stored_state = request.session.get("oauth_state")
    if not stored_state or stored_state != state:
        # State mismatch - possible CSRF
        frontend = settings.keycloak_frontend_url.rstrip("/")
        return RedirectResponse(url=f"{frontend}/?error=invalid_state", status_code=302)

    if not code:
        frontend = settings.keycloak_frontend_url.rstrip("/")
        return RedirectResponse(url=f"{frontend}/?error=no_code", status_code=302)

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            _token_url(),
            data={
                "grant_type": "authorization_code",
                "client_id": settings.keycloak_client_id,
                "client_secret": settings.keycloak_client_secret,
                "code": code,
                "redirect_uri": settings.keycloak_redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if token_res.status_code != 200:
        frontend = settings.keycloak_frontend_url.rstrip("/")
        return RedirectResponse(
            url=f"{frontend}/?error=token_exchange_failed",
            status_code=302,
        )

    data = token_res.json()
    request.session["access_token"] = data.get("access_token")
    request.session["refresh_token"] = data.get("refresh_token")
    if "oauth_state" in request.session:
        del request.session["oauth_state"]

    frontend = settings.keycloak_frontend_url.rstrip("/")
    return RedirectResponse(url=frontend, status_code=302)


@router.get("/logout")
async def logout(request: Request) -> RedirectResponse:
    """Clear session and redirect to Keycloak logout."""
    request.session.clear()

    params = {
        "post_logout_redirect_uri": settings.keycloak_frontend_url.rstrip("/"),
        "client_id": settings.keycloak_client_id,
    }
    url = f"{_logout_url()}?{urlencode(params)}"
    return RedirectResponse(url=url, status_code=302)
