"""OAuth2 Keycloak authentication API."""

import secrets
from urllib.parse import urlencode

import jwt
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from jwt import PyJWKClient

from app.config import settings

_JWKS_CLIENT: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _JWKS_CLIENT
    if _JWKS_CLIENT is None:
        base = settings.keycloak_auth_server_url.rstrip("/")
        jwks_url = f"{base}/realms/{settings.keycloak_realm}/protocol/openid-connect/certs"
        _JWKS_CLIENT = PyJWKClient(jwks_url)
    return _JWKS_CLIENT


def _verify_jwt(token: str) -> dict:
    """Verify Keycloak JWT and return payload. Raises on invalid token."""
    try:
        jwks = _get_jwks_client()
        header = jwt.get_unverified_header(token)
        key = jwks.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from e


async def require_auth(request: Request) -> str:
    """Verify user is authenticated. Accepts session cookie OR Authorization Bearer JWT. Returns token."""
    # 1. Check Authorization Bearer (frontend Keycloak JS)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            _verify_jwt(token)
            return token

    # 2. Check session (backend OAuth flow)
    token = request.session.get("access_token")
    if token:
        return token

    raise HTTPException(status_code=401, detail="Authentication required")


async def get_jwt_payload(request: Request) -> dict:
    """Return verified JWT claims (sub, preferred_username, etc.) for the current request."""
    token = await require_auth(request)
    return _verify_jwt(token)


async def require_admin(request: Request) -> str:
    """Require authentication AND the 'admin' realm role from Keycloak JWT."""
    token = await require_auth(request)
    payload = _verify_jwt(token)
    realm_access = payload.get("realm_access", {})
    roles = realm_access.get("roles", [])
    if "admin" not in roles:
        raise HTTPException(status_code=403, detail="Admin role required")
    return token


async def require_service_client(request: Request) -> str:
    """Require authentication AND token from the configured service client (e.g. openkms-cli)."""
    token = await require_auth(request)
    payload = _verify_jwt(token)
    azp = payload.get("azp") or payload.get("client_id")
    if azp != settings.keycloak_service_client_id:
        raise HTTPException(status_code=403, detail="Service client required")
    return token


router = APIRouter(tags=["auth"])


@router.post("/sync-session")
async def sync_session(request: Request) -> dict:
    """Sync frontend Keycloak JWT to backend session. Call after login so img/cookie-based requests work."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    token = auth_header[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Bearer token required")
    _verify_jwt(token)
    request.session["access_token"] = token
    return {"ok": True}


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


@router.post("/clear-session")
async def clear_session(request: Request) -> dict:
    """Clear backend session only. No redirect to Keycloak."""
    request.session.clear()
    return {"ok": True}


@router.get("/logout")
async def logout(request: Request) -> RedirectResponse:
    """Clear session and redirect to Keycloak logout (legacy; use clear-session for local logout)."""
    request.session.clear()
    params = {
        "post_logout_redirect_uri": settings.keycloak_frontend_url.rstrip("/"),
        "client_id": settings.keycloak_logout_client_id,
    }
    url = f"{_logout_url()}?{urlencode(params)}"
    return RedirectResponse(url=url, status_code=302)
