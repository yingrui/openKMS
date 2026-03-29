"""Authentication: OIDC (external IdP) or local PostgreSQL users."""

import base64
import binascii
import secrets
import time
from typing import Literal
from urllib.parse import urlencode

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from jwt import PyJWKClient
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.oidc_discovery import get_oidc_provider_metadata

_JWKS_CLIENT: PyJWKClient | None = None

LOCAL_JWT_ALG = "HS256"
LOCAL_JWT_ISS = "openkms-local"


def _frontend_base() -> str:
    return settings.frontend_url.rstrip("/")


def _get_jwks_client() -> PyJWKClient:
    global _JWKS_CLIENT
    if _JWKS_CLIENT is None:
        meta = get_oidc_provider_metadata()
        jwks_uri = meta.get("jwks_uri")
        if not jwks_uri:
            raise RuntimeError("OIDC metadata missing jwks_uri")
        _JWKS_CLIENT = PyJWKClient(jwks_uri)
    return _JWKS_CLIENT


def _verify_oidc_jwt(token: str) -> dict:
    try:
        meta = get_oidc_provider_metadata()
        jwks = _get_jwks_client()
        key = jwks.get_signing_key_from_jwt(token)
        issuer = meta.get("issuer")
        kw: dict = {
            "algorithms": ["RS256"],
            "options": {"verify_aud": False},
        }
        if issuer:
            kw["issuer"] = issuer
        return jwt.decode(token, key.key, **kw)
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from e


def _verify_local_jwt(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            settings.secret_key,
            algorithms=[LOCAL_JWT_ALG],
            issuer=LOCAL_JWT_ISS,
            options={"verify_aud": False},
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from e


def _verify_token_for_mode(token: str) -> dict:
    if settings.auth_mode == "local":
        return _verify_local_jwt(token)
    return _verify_oidc_jwt(token)


def _user_claims(user: User) -> dict:
    roles = ["admin"] if user.is_admin else []
    return {
        "sub": str(user.id),
        "preferred_username": user.username,
        "name": user.username,
        "email": user.email,
        "realm_access": {"roles": roles},
    }


def mint_local_user_jwt(user: User) -> str:
    now = int(time.time())
    exp = now + int(settings.local_jwt_exp_hours * 3600)
    payload = {**_user_claims(user), "iss": LOCAL_JWT_ISS, "iat": now, "exp": exp}
    return jwt.encode(payload, settings.secret_key, algorithm=LOCAL_JWT_ALG)


def mint_local_cli_jwt() -> str:
    now = int(time.time())
    exp = now + 3600
    payload = {
        "sub": "local-cli",
        "preferred_username": "openkms-cli",
        "name": "openkms-cli",
        "email": None,
        "realm_access": {"roles": []},
        "azp": settings.oidc_service_client_id,
        "iss": LOCAL_JWT_ISS,
        "iat": now,
        "exp": exp,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=LOCAL_JWT_ALG)


def _parse_basic_auth(header: str) -> tuple[str, str] | None:
    if not header or not header.lower().startswith("basic "):
        return None
    raw = header[6:].strip()
    if not raw:
        return None
    try:
        decoded = base64.b64decode(raw).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return None
    if ":" not in decoded:
        return None
    user, _, password = decoded.partition(":")
    return (user, password)


def _local_basic_matches(username: str, password: str) -> bool:
    cfg_user = settings.cli_basic_user
    cfg_pass = settings.cli_basic_password
    if not cfg_user or not cfg_pass:
        return False
    return secrets.compare_digest(username, cfg_user) and secrets.compare_digest(password, cfg_pass)


def _set_auth_state(request: Request, payload: dict, token: str) -> None:
    request.state.openkms_jwt_payload = payload
    request.state.openkms_auth_token = token


async def require_auth(request: Request) -> str:
    """Bearer JWT, session cookie token, or (local mode) HTTP Basic for CLI."""
    auth_header = request.headers.get("Authorization")

    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            payload = _verify_token_for_mode(token)
            _set_auth_state(request, payload, token)
            return token

    if settings.auth_mode == "local" and auth_header:
        basic = _parse_basic_auth(auth_header)
        if basic:
            u, p = basic
            if _local_basic_matches(u, p):
                token = mint_local_cli_jwt()
                payload = _verify_local_jwt(token)
                _set_auth_state(request, payload, token)
                return token

    token = request.session.get("access_token")
    if token and isinstance(token, str):
        payload = _verify_token_for_mode(token)
        _set_auth_state(request, payload, token)
        return token

    raise HTTPException(status_code=401, detail="Authentication required")


async def get_jwt_payload(request: Request) -> dict:
    await require_auth(request)
    return request.state.openkms_jwt_payload


async def require_admin(request: Request) -> str:
    token = await require_auth(request)
    payload = request.state.openkms_jwt_payload
    realm_access = payload.get("realm_access", {})
    roles = realm_access.get("roles", [])
    if "admin" not in roles:
        raise HTTPException(status_code=403, detail="Admin role required")
    return token


async def require_service_client(request: Request) -> str:
    token = await require_auth(request)
    payload = request.state.openkms_jwt_payload
    azp = payload.get("azp") or payload.get("client_id")
    if azp != settings.oidc_service_client_id:
        raise HTTPException(status_code=403, detail="Service client required")
    return token


router = APIRouter(tags=["auth"])


@router.post("/sync-session")
async def sync_session(request: Request) -> dict:
    """Sync browser JWT to backend session (cookie) for credentialed img/object requests."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    token = auth_header[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Bearer token required")
    _verify_token_for_mode(token)
    request.session["access_token"] = token
    return {"ok": True}


@router.get("/login")
async def login(request: Request) -> RedirectResponse:
    """Redirect to OIDC authorization endpoint (oidc mode only)."""
    if settings.auth_mode == "local":
        return RedirectResponse(url=f"{_frontend_base()}/login?notice=local_auth", status_code=302)
    meta = get_oidc_provider_metadata()
    auth_ep = meta.get("authorization_endpoint")
    if not auth_ep:
        raise HTTPException(status_code=500, detail="OIDC metadata missing authorization_endpoint")
    state = secrets.token_urlsafe(32)
    request.session["oauth_state"] = state
    params = {
        "client_id": settings.oidc_client_id,
        "redirect_uri": settings.oidc_redirect_uri,
        "response_type": "code",
        "scope": "openid",
        "state": state,
    }
    url = f"{auth_ep}?{urlencode(params)}"
    return RedirectResponse(url=url, status_code=302)


@router.get("/login/oauth2/code/oidc")
@router.get("/login/oauth2/code/keycloak", include_in_schema=False)
async def oauth2_callback(
    request: Request,
    response: Response,
    code: str = "",
    state: str = "",
) -> RedirectResponse:
    """OAuth2 authorization callback (oidc mode only)."""
    if settings.auth_mode == "local":
        return RedirectResponse(url=f"{_frontend_base()}/login?notice=local_auth", status_code=302)
    import httpx

    stored_state = request.session.get("oauth_state")
    if not stored_state or stored_state != state:
        frontend = _frontend_base()
        return RedirectResponse(url=f"{frontend}/?error=invalid_state", status_code=302)

    if not code:
        frontend = _frontend_base()
        return RedirectResponse(url=f"{frontend}/?error=no_code", status_code=302)

    meta = get_oidc_provider_metadata()
    token_ep = meta.get("token_endpoint")
    if not token_ep:
        frontend = _frontend_base()
        return RedirectResponse(url=f"{frontend}/?error=no_token_endpoint", status_code=302)

    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            token_ep,
            data={
                "grant_type": "authorization_code",
                "client_id": settings.oidc_client_id,
                "client_secret": settings.oidc_client_secret,
                "code": code,
                "redirect_uri": settings.oidc_redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if token_res.status_code != 200:
        frontend = _frontend_base()
        return RedirectResponse(url=f"{frontend}/?error=token_exchange_failed", status_code=302)

    data = token_res.json()
    request.session["access_token"] = data.get("access_token")
    request.session["refresh_token"] = data.get("refresh_token")
    if "oauth_state" in request.session:
        del request.session["oauth_state"]

    frontend = _frontend_base()
    return RedirectResponse(url=frontend, status_code=302)


@router.post("/clear-session")
async def clear_session(request: Request) -> dict:
    request.session.clear()
    return {"ok": True}


@router.get("/logout")
async def logout(request: Request) -> RedirectResponse:
    """Clear session; in oidc mode redirect to IdP logout."""
    request.session.clear()
    if settings.auth_mode == "local":
        return RedirectResponse(url=_frontend_base(), status_code=302)
    meta = get_oidc_provider_metadata()
    end = meta.get("end_session_endpoint")
    if not end:
        return RedirectResponse(url=_frontend_base(), status_code=302)
    params = {
        "post_logout_redirect_uri": _frontend_base(),
        "client_id": settings.oidc_post_logout_client_id,
    }
    url = f"{end}?{urlencode(params)}"
    return RedirectResponse(url=url, status_code=302)


# --- /api/auth (local signup/login + shared /me) ---


class RegisterBody(BaseModel):
    email: EmailStr
    username: str = Field(min_length=2, max_length=128)
    password: str = Field(min_length=8, max_length=256)


class LoginBody(BaseModel):
    """Username or email (case-insensitive for username) plus password."""

    login: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=256)


class AuthUserOut(BaseModel):
    id: str
    email: str
    username: str
    is_admin: bool
    roles: list[str] = Field(
        default_factory=list,
        description="Realm roles from the JWT (e.g. Keycloak realm_access.roles).",
    )


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUserOut


api_auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


class PublicAuthConfig(BaseModel):
    """Unauthenticated discovery so clients align with OPENKMS_AUTH_MODE (local vs central OIDC IdP)."""

    auth_mode: Literal["oidc", "local"]
    allow_signup: bool


@api_auth_router.get("/public-config", response_model=PublicAuthConfig)
async def public_auth_config() -> PublicAuthConfig:
    mode: Literal["oidc", "local"] = "local" if settings.auth_mode == "local" else "oidc"
    allow = bool(mode == "local" and settings.allow_signup)
    return PublicAuthConfig(auth_mode=mode, allow_signup=allow)


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


@api_auth_router.post("/register", response_model=TokenResponse)
async def register(
    body: RegisterBody,
    db: AsyncSession = Depends(get_db),
):
    if settings.auth_mode != "local":
        raise HTTPException(status_code=404, detail="Registration is only available in local auth mode")
    if not settings.allow_signup:
        raise HTTPException(status_code=403, detail="Sign up is disabled")

    username = body.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")

    cnt = await db.scalar(select(func.count()).select_from(User))
    is_admin = False
    if settings.initial_admin_user and username.lower() == settings.initial_admin_user.lower():
        is_admin = True
    elif cnt == 0:
        is_admin = True

    user = User(
        email=body.email.lower().strip(),
        username=username,
        password_hash=_hash_password(body.password),
        is_admin=is_admin,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Email or username already registered") from None

    token = mint_local_user_jwt(user)
    roles = ["admin"] if user.is_admin else []
    return TokenResponse(
        access_token=token,
        user=AuthUserOut(
            id=str(user.id),
            email=user.email,
            username=user.username,
            is_admin=user.is_admin,
            roles=roles,
        ),
    )


@api_auth_router.post("/login", response_model=TokenResponse)
async def login_json(body: LoginBody, db: AsyncSession = Depends(get_db)):
    if settings.auth_mode != "local":
        raise HTTPException(status_code=404, detail="Password login is only available in local auth mode")

    raw = body.login.strip()
    key = raw.lower()
    result = await db.execute(
        select(User).where(or_(User.email == key, func.lower(User.username) == key))
    )
    user = result.scalar_one_or_none()
    if not user or not _verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = mint_local_user_jwt(user)
    roles = ["admin"] if user.is_admin else []
    return TokenResponse(
        access_token=token,
        user=AuthUserOut(
            id=str(user.id),
            email=user.email,
            username=user.username,
            is_admin=user.is_admin,
            roles=roles,
        ),
    )


@api_auth_router.get("/me", response_model=AuthUserOut)
async def auth_me(request: Request):
    await require_auth(request)
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Invalid token")
    email = p.get("email")
    if email is not None and not isinstance(email, str):
        email = None
    realm = p.get("realm_access") or {}
    raw_roles = realm.get("roles") if isinstance(realm, dict) else []
    if not isinstance(raw_roles, list):
        raw_roles = []
    role_strs = [str(r) for r in raw_roles if r is not None and str(r).strip()]
    is_admin = "admin" in role_strs
    username = p.get("preferred_username") or p.get("name") or "user"
    if not isinstance(username, str):
        username = "user"
    return AuthUserOut(
        id=sub,
        email=email or "",
        username=username,
        is_admin=is_admin,
        roles=role_strs,
    )


@api_auth_router.post("/logout")
async def logout_json(request: Request) -> dict:
    """Clear server session (local or oidc); client should discard Bearer token."""
    request.session.clear()
    return {"ok": True}
