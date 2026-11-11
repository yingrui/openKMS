"""Authentication: OIDC (external IdP) or local PostgreSQL users."""

import asyncio
import base64
import binascii
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlencode, urlparse

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from jwt import PyJWKClient
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_maker, get_db
from app.models.user import User
from app.models.user_api_key import UserApiKey
from app.models.user_preference import UserPreference
from app.services.platform.audit import record_session_event_once
from app.services.platform.credentials.credential_encryption import DECRYPT_ERRORS
from app.services.identity.permissions.permission_catalog import PERM_ALL
from app.services.identity.permissions.security_permission_service import list_permissions_sorted, sorted_permission_keys
from app.services.identity import auth_session as auth_sessions
from app.services.identity.local_jwt import (
    LOCAL_JWT_ALG,
    LOCAL_JWT_ISS,
    mint_local_cli_jwt,
    mint_local_user_jwt,
    user_claims as _user_claims,
)
from app.services.identity.permissions.permission_resolution import (
    resolve_oidc_permission_keys,
    resolve_user_permission_keys,
)
from app.oidc_discovery import get_oidc_provider_metadata
from app.i18n.errors import error_detail_no_request, http_error

_JWKS_CLIENT: PyJWKClient | None = None


def _frontend_base() -> str:
    return settings.frontend_url.rstrip("/")


async def _revoke_current_auth_session(request: Request, db: AsyncSession) -> None:
    """Sign out a stale cookie session before replacing it at login/account switch."""
    session_id = request.session.get("auth_sid")
    if isinstance(session_id, str) and session_id:
        row = await auth_sessions.get_session(db, session_id)
        if row is not None:
            await auth_sessions.revoke_session(db, row)


def _require_same_origin(request: Request) -> None:
    """Reject cookie-auth mutations from another origin (SameSite is not the only line of defence)."""
    headers = getattr(request, "headers", None)
    if headers is None:
        return
    origin = headers.get("origin") or headers.get("referer")
    if not origin:
        return
    parsed = urlparse(origin)
    allowed = {urlparse(settings.frontend_url).netloc, headers.get("host", "")}
    if parsed.netloc and parsed.netloc not in allowed:
        raise http_error(request, 403, "CROSS_ORIGIN_REQUEST_REJECTED")


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
        raise HTTPException(
            status_code=401, detail=error_detail_no_request("INVALID_OR_EXPIRED_TOKEN")
        ) from e


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
        raise HTTPException(
            status_code=401, detail=error_detail_no_request("INVALID_OR_EXPIRED_TOKEN")
        ) from e


def _verify_token_for_mode(token: str) -> dict:
    if settings.auth_mode == "local":
        return _verify_local_jwt(token)
    return _verify_oidc_jwt(token)


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
    for cfg_user, cfg_pass in (
        (settings.cli_basic_user, settings.cli_basic_password),
        (settings.worker_basic_user, settings.worker_basic_password),
        (settings.qa_agent_basic_user, settings.qa_agent_basic_password),
    ):
        if cfg_user and cfg_pass and secrets.compare_digest(username, cfg_user) and secrets.compare_digest(
            password, cfg_pass
        ):
            return True
    return False


def _set_auth_state(request: Request, payload: dict, token: str) -> None:
    request.state.openkms_jwt_payload = payload
    request.state.openkms_auth_token = token


def _is_personal_api_key_token_format(token: str) -> bool:
    parts = token.split(".", 2)
    return len(parts) == 3 and parts[0] == "okms" and len(parts[1]) >= 32


async def _authenticate_personal_api_key(request: Request, db: AsyncSession, token: str) -> str | None:
    """If token is okms.{key_id}.{secret}, validate and set request auth state. Returns token or None."""
    if not _is_personal_api_key_token_format(token):
        return None
    _prefix, key_id, secret = token.split(".", 2)
    row = await db.get(UserApiKey, key_id)
    if row is None or row.revoked_at is not None:
        return None
    if not _verify_api_key_secret(secret, row.secret_hash):
        return None
    # Touch last_used_at in its own short transaction. Flushing on the request
    # session would hold a row lock until the handler finishes — nested Client
    # calls during function execute (same API key) then deadlock on auth.
    async with async_session_maker() as touch_db:
        touch = await touch_db.get(UserApiKey, key_id)
        if touch is not None and touch.revoked_at is None:
            touch.last_used_at = datetime.now(timezone.utc)
            await touch_db.commit()

    if row.auth_mode == "local":
        user = await db.get(User, row.owner_sub)
        if user is None:
            return None
        payload = {
            **_user_claims(user),
            "iss": LOCAL_JWT_ISS,
            "iat": int(time.time()),
            "exp": int(time.time()) + int(settings.local_jwt_exp_hours * 3600),
            "openkms_auth_via": "api_key",
            "openkms_api_key_id": row.id,
        }
    else:
        roles = row.oidc_realm_roles if isinstance(row.oidc_realm_roles, list) else []
        role_strs = [str(r) for r in roles if r is not None and str(r).strip()]
        payload = {
            "sub": row.owner_sub,
            "preferred_username": row.display_username or "user",
            "name": row.display_username or "user",
            "email": row.display_email or None,
            "realm_access": {"roles": role_strs},
            "openkms_auth_via": "api_key",
            "openkms_api_key_id": row.id,
        }
    _set_auth_state(request, payload, token)
    return token


def _hash_api_key_secret(secret: str) -> str:
    return bcrypt.hashpw(secret.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_api_key_secret(secret: str, secret_hash: str) -> bool:
    try:
        return bcrypt.checkpw(secret.encode("utf-8"), secret_hash.encode("utf-8"))
    except ValueError:
        return False


async def authenticate_request(request: Request, db: AsyncSession, *, session_only: bool = False) -> str:
    """Bearer JWT or personal API key, session cookie JWT, or (local mode) HTTP Basic for CLI.

    ``session_only`` ignores the Authorization header (it belongs to a proxied hosted app).
    """
    auth_header = None if session_only else request.headers.get("Authorization")

    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            try:
                payload = _verify_token_for_mode(token)
                _set_auth_state(request, payload, token)
                return token
            except HTTPException:
                api = await _authenticate_personal_api_key(request, db, token)
                if api:
                    return api
                raise

    if settings.auth_mode == "local" and auth_header:
        basic = _parse_basic_auth(auth_header)
        if basic:
            u, p = basic
            if _local_basic_matches(u, p):
                token = mint_local_cli_jwt()
                payload = _verify_local_jwt(token)
                _set_auth_state(request, payload, token)
                return token

    if settings.auth_session_v2:
        session_id = request.session.get("auth_sid")
        if isinstance(session_id, str) and session_id:
            row = await auth_sessions.get_session(db, session_id)
            if row is not None and auth_sessions.session_active(row):
                now = auth_sessions.utcnow()
                if row.access_expires_at <= now + timedelta(seconds=auth_sessions.REFRESH_SKEW_SECONDS):
                    if not await auth_sessions.refresh_session(db, row):
                        await auth_sessions.revoke_session(db, row)
                        request.session.pop("auth_sid", None)
                        raise http_error(request, 401, "AUTHENTICATION_REQUIRED")
                try:
                    token = auth_sessions.access_token_of(row)
                except DECRYPT_ERRORS:
                    await auth_sessions.revoke_session(db, row)
                    request.session.pop("auth_sid", None)
                    raise http_error(request, 401, "AUTHENTICATION_REQUIRED") from None
                payload = _verify_token_for_mode(token)
                _set_auth_state(request, payload, token)
                await auth_sessions.touch_session(db, row)
                await db.commit()
                return token
            if row is not None:
                await auth_sessions.revoke_session(db, row)
            request.session.pop("auth_sid", None)

    token = request.session.get("access_token")
    if token and isinstance(token, str):
        payload = _verify_token_for_mode(token)
        _set_auth_state(request, payload, token)
        return token

    raise http_error(request, 401, "AUTHENTICATION_REQUIRED")


async def require_auth(request: Request, db: AsyncSession = Depends(get_db)) -> str:
    return await authenticate_request(request, db)


async def get_jwt_payload(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    await authenticate_request(request, db)
    return request.state.openkms_jwt_payload


def jwt_payload_is_admin(payload: dict) -> bool:
    realm_access = payload.get("realm_access", {})
    roles = realm_access.get("roles", [])
    if not isinstance(roles, list):
        return False
    return "admin" in {str(r) for r in roles if r is not None}


async def require_admin(request: Request, db: AsyncSession = Depends(get_db)) -> str:
    token = await authenticate_request(request, db)
    payload = request.state.openkms_jwt_payload
    if not jwt_payload_is_admin(payload):
        raise http_error(request, 403, "ADMIN_ROLE_REQUIRED")
    return token


async def ensure_permission(request: Request, db: AsyncSession, permission: str) -> None:
    """Grant if JWT admin, local-cli service JWT, or DB-resolved permissions (local or OIDC role names)."""
    await authenticate_request(request, db)
    payload = request.state.openkms_jwt_payload
    if jwt_payload_is_admin(payload):
        return
    sub = payload.get("sub")
    if sub == "local-cli":
        return
    if not isinstance(sub, str):
        raise http_error(request, 403, "FORBIDDEN_GENERIC")
    if settings.auth_mode == "local":
        perms = await resolve_user_permission_keys(db, sub)
    else:
        perms = await resolve_oidc_permission_keys(db, payload)
    if PERM_ALL in perms:
        return
    if permission not in perms:
        raise http_error(request, 403, "MISSING_PERMISSION", permission=permission)


def require_permission(permission: str):
    async def _check(request: Request, db: AsyncSession = Depends(get_db)) -> None:
        await ensure_permission(request, db, permission)

    return _check


async def ensure_any_permission(
    request: Request, db: AsyncSession, *permissions: str, session_only: bool = False
) -> None:
    """Grant if admin, local-cli, all, or the user holds any of the given permission keys."""
    if not permissions:
        raise http_error(request, 500, "NO_PERMISSIONS_PROVIDED")
    await authenticate_request(request, db, session_only=session_only)
    payload = request.state.openkms_jwt_payload
    if jwt_payload_is_admin(payload):
        return
    sub = payload.get("sub")
    if sub == "local-cli":
        return
    if not isinstance(sub, str):
        raise http_error(request, 403, "FORBIDDEN_GENERIC")
    if settings.auth_mode == "local":
        perms = await resolve_user_permission_keys(db, sub)
    else:
        perms = await resolve_oidc_permission_keys(db, payload)
    if PERM_ALL in perms:
        return
    if any(p in perms for p in permissions):
        return
    need = " or ".join(permissions)
    raise http_error(request, 403, "MISSING_PERMISSION_ONE_OF", need=need)


def require_any_permission(*permissions: str, session_only: bool = False):
    async def _check(request: Request, db: AsyncSession = Depends(get_db)) -> None:
        await ensure_any_permission(request, db, *permissions, session_only=session_only)

    return _check


def _is_internal_service_caller(payload: dict) -> bool:
    """True for local CLI Basic (``sub=local-cli``) or OIDC machine clients on the allowlist."""
    if payload.get("sub") == "local-cli":
        return True
    client_id = payload.get("azp") or payload.get("client_id")
    return isinstance(client_id, str) and client_id in settings.resolved_internal_service_client_ids


async def require_internal_client(request: Request, db: AsyncSession = Depends(get_db)) -> str:
    """Authenticate and require an internal service caller (openkms-cli, qa-agent, worker CLI auth)."""
    token = await authenticate_request(request, db)
    payload = request.state.openkms_jwt_payload
    if not _is_internal_service_caller(payload):
        raise http_error(request, 403, "SERVICE_CLIENT_REQUIRED")
    return token


# Back-compat name for docs / mental model (service JWT on /internal-api only).
require_service_client = require_internal_client


router = APIRouter(tags=["auth"])


def _session_actor(request: Request) -> tuple[dict, str | None]:
    """Who is signing out — read from the cookie's token **before** it is cleared, and verified.

    An unverified decode would let anyone set the name in the audit log by handing us a forged token, which
    is precisely the misattribution an audit log exists to prevent. An expired token is normal at logout, so
    this is best effort: no answer is better than a wrong one.
    """
    token = request.session.get("access_token")
    if not isinstance(token, str) or not token.strip():
        return {}, "no_session_token"
    try:
        return _verify_token_for_mode(token.strip()), None
    except HTTPException:
        # The verifiers already turn every failure into an HTTPException (expired, wrong issuer, bad
        # signature), so this is the whole failure surface — not a blanket catch.
        return {}, "token_not_verified"


async def record_session_event(
    kind: str, payload: dict, *, via: str, reason: str | None = None, attempted: str | None = None
) -> None:
    """Record a sign-in / sign-out. Best effort: an audit outage must not block logging in or out.

    `via` names the entry point (`clear-session`, `logout`, `oidc-callback`) and `reason` says why there is no
    actor — "anonymous" on a logout is usually *correct*: the SPA also clears the cookie when the API has
    already rejected it, and a dead token cannot name anyone. Saying which case it was is the difference
    between an explained event and a suspicious one.
    """
    sub = payload.get("sub")
    # One sign-in, one row: the SPA syncs the token twice (the init and the user-loaded hook), milliseconds
    # apart, and both say `reason=login`. A repeated identical session event inside the window is the same act.
    await record_session_event_once(
        path=f"auth/{kind}",
        actor_sub=sub if isinstance(sub, str) else None,
        actor_name=(
            payload.get("username")
            or payload.get("email")
            or payload.get("preferred_username")
            or None
        ),
        auth_mode=payload.get("auth_mode") if isinstance(payload.get("auth_mode"), str) else None,
        detail={
            "via": via,
            **({"reason": reason} if reason else {}),
            **({"attempted": attempted} if attempted else {}),
        },
    )


def session_identity(payload: dict) -> tuple | None:
    """Who the session belongs to, and when they authenticated — stable across token refreshes.

    The SPA signs in with the IdP itself (oidc-client-ts, PKCE) and then hands the token here, so this call is
    the only place the backend sees a login — but it also fires on every load. `auth_time` is the claim that
    distinguishes them: it is the moment the user actually signed in and does **not** move when the token is
    refreshed, while a new `sid` (Keycloak) means a new session. Returns None when there is nothing to compare.
    """
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        return None
    auth_time = payload.get("auth_time")
    sid = payload.get("sid")
    session_state = payload.get("session_state")
    if auth_time is None and sid is None and session_state is None:
        return None
    return (sub, auth_time, sid or session_state)


@router.post("/sync-session")
async def sync_session(
    request: Request,
    reason: str | None = Query(None, description="`login` when the client just signed in"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Sync browser JWT to backend session (cookie) for credentialed img/object requests."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise http_error(request, 401, "BEARER_TOKEN_REQUIRED")
    token = auth_header[7:].strip()
    if not token:
        raise http_error(request, 401, "BEARER_TOKEN_REQUIRED")
    payload = _verify_token_for_mode(token)

    # A sign-in, one of two ways: the client says so (`?reason=login`, set by the SPA when *it* started the
    # login and cleared once recorded), or the session differs from the one the cookie held. The second
    # depends on claims the IdP may not put in an access token, so the explicit signal is the reliable one.
    previous = _session_actor(request)[0]
    if reason == "login" or session_identity(payload) != session_identity(previous):
        await record_session_event("login", payload, via="sync-session")

    if settings.auth_session_v2:
        sub = payload.get("sub")
        if not isinstance(sub, str) or not sub:
            raise http_error(request, 401, "INVALID_TOKEN")
        current_id = request.session.get("auth_sid")
        row = await auth_sessions.get_session(db, current_id) if isinstance(current_id, str) and current_id else None
        expires_at = auth_sessions.token_expiry(token)
        if (
            row is not None
            and auth_sessions.session_active(row)
            and row.user_sub == sub
        ):
            await auth_sessions.update_session_access_token(
                db, row, access_token=token, access_expires_at=expires_at
            )
            await auth_sessions.touch_session(db, row)
        else:
            if row is not None:
                await auth_sessions.revoke_session(db, row)
            row = await auth_sessions.create_session(
                db,
                auth_mode="oidc" if settings.auth_mode == "oidc" else "local",
                user_sub=sub,
                idp_sub=sub,
                access_token=token,
                refresh_token=None,
                access_expires_at=expires_at,
            )
        request.session.pop("access_token", None)
        request.session["auth_sid"] = row.id
    else:
        request.session["access_token"] = token
    from app.services.identity.users.oidc_identity_service import upsert_oidc_identity_from_jwt

    await upsert_oidc_identity_from_jwt(db, payload)
    await db.commit()
    return {"ok": True}


def _safe_return_to(raw: str | None) -> str:
    """Only allow same-origin relative paths; never an open redirect."""
    if not raw:
        return "/"
    value = raw.strip()
    if not value.startswith("/") or value.startswith("//") or "\\" in value:
        return "/"
    parsed = urlparse(value)
    if parsed.scheme or parsed.netloc:
        return "/"
    return value


async def _start_oidc_login(request: Request, return_to: str | None) -> RedirectResponse:
    if settings.auth_mode == "local":
        return RedirectResponse(url=f"{_frontend_base()}/login?notice=local_auth", status_code=302)
    meta = get_oidc_provider_metadata()
    auth_ep = meta.get("authorization_endpoint")
    if not auth_ep:
        raise http_error(request, 500, "OIDC_METADATA_MISSING_AUTH_ENDPOINT")
    state = secrets.token_urlsafe(32)
    request.session["oauth_state"] = state
    request.session["oauth_return_to"] = _safe_return_to(return_to)
    scope = "openid profile email"
    if settings.auth_session_v2:
        scope += " offline_access"
    params = {
        "client_id": settings.oidc_client_id,
        "redirect_uri": settings.oidc_redirect_uri,
        "response_type": "code",
        "scope": scope,
        "state": state,
    }
    url = f"{auth_ep}?{urlencode(params)}"
    return RedirectResponse(url=url, status_code=302)


@router.get("/login")
async def login(request: Request, returnTo: str = "/") -> RedirectResponse:
    """Redirect to OIDC authorization endpoint (oidc mode only)."""
    return await _start_oidc_login(request, returnTo)


@router.get("/login/oauth2/code/oidc")
@router.get("/login/oauth2/code/keycloak", include_in_schema=False)
async def oauth2_callback(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
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
    access_token = data.get("access_token")
    refresh_token = data.get("refresh_token")
    return_to = _safe_return_to(request.session.get("oauth_return_to", "/"))
    if not isinstance(access_token, str) or not access_token.strip():
        frontend = _frontend_base()
        return RedirectResponse(url=f"{frontend}/?error=no_access_token", status_code=302)
    access_token = access_token.strip()

    from app.services.identity.users.oidc_identity_service import upsert_oidc_identity_from_jwt

    payload = _verify_oidc_jwt(access_token)
    await upsert_oidc_identity_from_jwt(db, payload)
    await db.commit()
    # Signing in is the security event; the callback is a GET, so the mutation middleware never saw it.
    await record_session_event("login", payload, via="oidc-callback")

    if settings.auth_session_v2:
        sub = payload.get("sub")
        if not isinstance(sub, str) or not sub:
            frontend = _frontend_base()
            return RedirectResponse(url=f"{frontend}/?error=missing_subject", status_code=302)
        row = await auth_sessions.create_session(
            db,
            auth_mode="oidc",
            user_sub=sub,
            idp_sub=sub,
            access_token=access_token,
            refresh_token=refresh_token if isinstance(refresh_token, str) else None,
            access_expires_at=auth_sessions.token_expiry(access_token, data.get("expires_in")),
        )
        request.session.clear()
        request.session["auth_sid"] = row.id
        await db.commit()
    else:
        request.session["access_token"] = access_token
        request.session["refresh_token"] = refresh_token
        if "oauth_state" in request.session:
            del request.session["oauth_state"]

    frontend = _frontend_base()
    return RedirectResponse(url=f"{frontend}{return_to}", status_code=302)


@router.post("/clear-session")
async def clear_session(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Sign out of the SPA: the token lives in this cookie, so clearing it ends the session.

    Recorded as the same `auth/logout` event as `GET /logout` — it is the same act, and one act should not
    read as two kinds of thing. Excluded from the generic middleware for that reason (`NOT_AUDITED`).
    """
    _require_same_origin(request)
    payload, reason = _session_actor(request)
    session_id = request.session.get("auth_sid")
    if isinstance(session_id, str) and session_id:
        row = await auth_sessions.get_session(db, session_id)
        if row is not None:
            await auth_sessions.revoke_session(db, row)
            await db.commit()
    request.session.clear()
    # One sign-out, one event. The SPA calls this again from its session-invalid handler, seconds later,
    # when the cookie is already gone — nothing was ended, so nothing is recorded. An expired or unverified
    # token is the same case: there was no live session to end.
    if reason is None:
        await record_session_event("logout", payload, via="clear-session")
    return {"ok": True}


@router.get("/logout")
async def logout(request: Request, db: AsyncSession = Depends(get_db)) -> RedirectResponse:
    """Clear session; in oidc mode redirect to IdP logout."""
    payload, reason = _session_actor(request)
    session_id = request.session.get("auth_sid")
    if isinstance(session_id, str) and session_id:
        row = await auth_sessions.get_session(db, session_id)
        if row is not None:
            await auth_sessions.revoke_session(db, row)
            await db.commit()
    request.session.clear()
    # A GET cannot carry a mutation to the middleware, but it is the end of a session — when there was one.
    if reason is None:
        await record_session_event("logout", payload, via="logout")
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
    permissions: list[str] = Field(
        default_factory=list,
        description="Resolved operation permissions; IdP admins receive the full catalog.",
    )
    ui_locale: str | None = Field(
        default=None,
        description="Saved UI language from user_preferences (en or zh-CN).",
    )
    default_agent_project_id: str | None = Field(
        default=None,
        description="Preferred Agent Project for Home composer (projects.id owned by the user).",
    )


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUserOut


api_auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


@api_auth_router.get("/oidc/login")
async def oidc_bff_login(request: Request, returnTo: str = "/") -> RedirectResponse:
    """BFF OIDC entry point; the IdP returns to the backend callback, which sets the opaque session."""
    if not settings.auth_session_v2:
        raise http_error(request, 404, "AUTH_SESSION_V2_DISABLED")
    return await _start_oidc_login(request, returnTo)


@api_auth_router.get("/oidc/logout")
async def oidc_bff_logout(request: Request, db: AsyncSession = Depends(get_db)) -> RedirectResponse:
    """BFF logout: revoke the server-side session, then RP-initiated logout when available."""
    return await logout(request, db)


class PublicAuthConfig(BaseModel):
    """Unauthenticated discovery so clients align with OPENKMS_AUTH_MODE (local vs central OIDC IdP)."""

    auth_mode: Literal["oidc", "local"]
    allow_signup: bool
    session_v2: bool = False


@api_auth_router.get("/public-config", response_model=PublicAuthConfig)
async def public_auth_config() -> PublicAuthConfig:
    mode: Literal["oidc", "local"] = "local" if settings.auth_mode == "local" else "oidc"
    allow = bool(mode == "local" and settings.allow_signup)
    return PublicAuthConfig(auth_mode=mode, allow_signup=allow, session_v2=settings.auth_session_v2)


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


@api_auth_router.post("/register", response_model=TokenResponse)
async def register(
    request: Request,
    body: RegisterBody,
    db: AsyncSession = Depends(get_db),
):
    if settings.auth_mode != "local":
        raise http_error(request, 404, "REGISTRATION_LOCAL_ONLY")
    if not settings.allow_signup:
        raise http_error(request, 403, "SIGNUP_DISABLED")

    username = body.username.strip()
    if not username:
        raise http_error(request, 400, "USERNAME_REQUIRED")

    cnt = await db.scalar(select(func.count()).select_from(User))
    is_admin = cnt == 0

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
        raise http_error(request, 409, "EMAIL_OR_USERNAME_TAKEN") from None

    from app.services.identity.users.user_roles_sync import sync_security_roles_for_user

    await sync_security_roles_for_user(db, user)
    if settings.auth_session_v2:
        await _revoke_current_auth_session(request, db)
        token = mint_local_user_jwt(user, ttl_minutes=settings.local_session_jwt_minutes)
        row = await auth_sessions.create_session(
            db,
            auth_mode="local",
            user_sub=str(user.id),
            idp_sub=str(user.id),
            access_token=token,
            refresh_token=None,
            access_expires_at=auth_sessions.utcnow()
            + timedelta(minutes=settings.local_session_jwt_minutes),
        )
        request.session.pop("access_token", None)
        request.session["auth_sid"] = row.id
        await db.commit()
    else:
        token = mint_local_user_jwt(user)
    roles = ["admin"] if user.is_admin else []
    perm_set = await resolve_user_permission_keys(db, str(user.id))
    return TokenResponse(
        access_token=token,
        user=AuthUserOut(
            id=str(user.id),
            email=user.email,
            username=user.username,
            is_admin=user.is_admin,
            roles=roles,
            permissions=sorted(perm_set),
        ),
    )


@api_auth_router.post("/login", response_model=TokenResponse)
async def login_json(request: Request, body: LoginBody, db: AsyncSession = Depends(get_db)):
    if settings.auth_mode != "local":
        raise http_error(request, 404, "PASSWORD_LOGIN_LOCAL_ONLY")

    raw = body.login.strip()
    key = raw.lower()
    result = await db.execute(
        select(User).where(or_(User.email == key, func.lower(User.username) == key))
    )
    user = result.scalar_one_or_none()
    if not user or not _verify_password(body.password, user.password_hash):
        # A failed sign-in is a security event — brute force looks exactly like this — and it names the
        # account *attempted*, as data rather than as an actor: nobody authenticated.
        await record_session_event(
            "login-failed", {}, via="local-login", attempted=raw or None
        )
        raise http_error(request, 401, "INVALID_CREDENTIALS")

    await record_session_event(
        "login",
        {
            "sub": str(user.id),
            "username": user.username,
            "email": user.email,
            "auth_mode": "local",
        },
        via="local-login",
    )
    if settings.auth_session_v2:
        await _revoke_current_auth_session(request, db)
        token = mint_local_user_jwt(user, ttl_minutes=settings.local_session_jwt_minutes)
        row = await auth_sessions.create_session(
            db,
            auth_mode="local",
            user_sub=str(user.id),
            idp_sub=str(user.id),
            access_token=token,
            refresh_token=None,
            access_expires_at=auth_sessions.utcnow()
            + timedelta(minutes=settings.local_session_jwt_minutes),
        )
        request.session.pop("access_token", None)
        request.session["auth_sid"] = row.id
        await db.commit()
    else:
        token = mint_local_user_jwt(user)
    roles = ["admin"] if user.is_admin else []
    perm_set = await resolve_user_permission_keys(db, str(user.id))
    return TokenResponse(
        access_token=token,
        user=AuthUserOut(
            id=str(user.id),
            email=user.email,
            username=user.username,
            is_admin=user.is_admin,
            roles=roles,
            permissions=sorted(perm_set),
        ),
    )


class PermissionCatalogEntry(BaseModel):
    key: str
    label: str
    description: str = ""
    frontend_route_patterns: list[str] = Field(default_factory=list)
    backend_api_patterns: list[str] = Field(default_factory=list)


_permission_catalog_lock = asyncio.Lock()
_permission_catalog_cached_at: float = -1e9
_permission_catalog_cached: list[PermissionCatalogEntry] | None = None


def invalidate_permission_catalog_cache() -> None:
    """Clear in-process ``GET /api/auth/permission-catalog`` cache (e.g. after admin edits)."""
    global _permission_catalog_cached_at, _permission_catalog_cached
    _permission_catalog_cached = None
    _permission_catalog_cached_at = -1e9


async def _permission_catalog_from_db(db: AsyncSession) -> list[PermissionCatalogEntry]:
    rows = await list_permissions_sorted(db)
    out: list[PermissionCatalogEntry] = []
    for r in rows:
        fe = r.frontend_route_patterns if isinstance(r.frontend_route_patterns, list) else []
        be = r.backend_api_patterns if isinstance(r.backend_api_patterns, list) else []
        out.append(
            PermissionCatalogEntry(
                key=r.key,
                label=r.label,
                description=r.description or "",
                frontend_route_patterns=[str(x) for x in fe],
                backend_api_patterns=[str(x) for x in be],
            )
        )
    return out


@api_auth_router.get("/permission-catalog", response_model=list[PermissionCatalogEntry])
async def permission_catalog(
    _: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> list[PermissionCatalogEntry]:
    ttl = settings.permission_catalog_cache_seconds
    if ttl <= 0:
        return await _permission_catalog_from_db(db)
    global _permission_catalog_cached_at, _permission_catalog_cached
    async with _permission_catalog_lock:
        now = time.monotonic()
        if _permission_catalog_cached is not None and (now - _permission_catalog_cached_at) < ttl:
            return list(_permission_catalog_cached)
        out = await _permission_catalog_from_db(db)
        _permission_catalog_cached = out
        _permission_catalog_cached_at = now
        return list(out)


class CreateApiKeyBody(BaseModel):
    name: str = Field(default="", max_length=128)


class ApiKeyCreatedResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    token: str = Field(description="Full secret; shown only once. Store securely.")
    created_at: datetime | None = None


class ApiKeyListItem(BaseModel):
    id: str
    name: str
    key_prefix: str
    created_at: datetime | None = None
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None


def _current_owner_sub(request: Request) -> str:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or sub == "local-cli":
        raise http_error(request, 403, "CANNOT_MANAGE_API_KEYS_PRINCIPAL")
    return sub


@api_auth_router.post("/api-keys", response_model=ApiKeyCreatedResponse)
async def create_api_key(
    request: Request,
    body: CreateApiKeyBody,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(require_auth),
):
    from app.services.identity.users.user_api_key_service import mint_user_api_key

    sub = _current_owner_sub(request)
    p = request.state.openkms_jwt_payload
    name = (body.name or "").strip() or "default"
    row, full_token = await mint_user_api_key(
        db,
        owner_sub=sub,
        jwt_payload=p,
        name=name,
        purpose="personal",
    )
    await db.commit()
    await db.refresh(row)
    return ApiKeyCreatedResponse(
        id=row.id,
        name=row.name,
        key_prefix=row.key_prefix,
        token=full_token,
        created_at=row.created_at,
    )


@api_auth_router.get("/api-keys", response_model=list[ApiKeyListItem])
async def list_api_keys(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(require_auth),
    include_revoked: bool = False,
):
    sub = _current_owner_sub(request)
    q = (
        select(UserApiKey)
        .where(UserApiKey.owner_sub == sub, UserApiKey.purpose == "personal")
        .order_by(UserApiKey.created_at.desc())
    )
    if not include_revoked:
        q = q.where(UserApiKey.revoked_at.is_(None))
    result = await db.execute(q)
    rows = list(result.scalars().all())
    return [
        ApiKeyListItem(
            id=r.id,
            name=r.name,
            key_prefix=r.key_prefix,
            created_at=r.created_at,
            last_used_at=r.last_used_at,
            revoked_at=r.revoked_at,
        )
        for r in rows
    ]


@api_auth_router.delete("/api-keys/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(require_auth),
):
    sub = _current_owner_sub(request)
    row = await db.get(UserApiKey, key_id)
    if row is None or row.owner_sub != sub:
        raise http_error(request, 404, "API_KEY_NOT_FOUND")
    if row.revoked_at is not None:
        return Response(status_code=204)
    row.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=204)


class MePatchBody(BaseModel):
    ui_locale: Literal["en", "zh-CN"] | None = None
    # Present in the body (including null) updates the preference; omit to leave unchanged.
    default_agent_project_id: str | None = None
    current_password: str | None = None
    new_password: str | None = None

    def model_post_init(self, __context):
        if self.new_password is not None and not self.current_password:
            raise ValueError("current_password is required to change password")
        if self.current_password is not None and not self.new_password:
            raise ValueError("new_password is required to change password")


async def _pref_ui_locale(db: AsyncSession, sub: str) -> str | None:
    row = await db.get(UserPreference, sub)
    if row is None or row.ui_locale is None:
        return None
    if row.ui_locale in ("en", "zh-CN"):
        return row.ui_locale
    return None


async def _pref_default_agent_project_id(db: AsyncSession, sub: str) -> str | None:
    """Return the saved default when the project still belongs to this user."""
    from app.models.project import Project

    row = await db.get(UserPreference, sub)
    if row is None or not row.default_agent_project_id:
        return None
    pid = row.default_agent_project_id.strip()
    if not pid:
        return None
    project = await db.get(Project, pid)
    if project is None or project.user_sub != sub:
        return None
    return pid


async def _save_pref_ui_locale(db: AsyncSession, sub: str, ui_locale: Literal["en", "zh-CN"]) -> None:
    row = await db.get(UserPreference, sub)
    if row is None:
        db.add(UserPreference(subject_sub=sub, ui_locale=ui_locale))
    else:
        row.ui_locale = ui_locale
    await db.flush()


async def _save_pref_default_agent_project(
    db: AsyncSession, sub: str, project_id: str | None
) -> None:
    from app.models.project import Project

    if project_id is not None:
        pid = project_id.strip()
        if not pid:
            raise ValueError("default_agent_project_id must be non-empty or null")
        project = await db.get(Project, pid)
        if project is None or project.user_sub != sub:
            raise LookupError("project")
        project_id = pid
    row = await db.get(UserPreference, sub)
    if row is None:
        db.add(UserPreference(subject_sub=sub, default_agent_project_id=project_id))
    else:
        row.default_agent_project_id = project_id
    await db.flush()


async def build_auth_user_out(request: Request, db: AsyncSession) -> AuthUserOut:
    """Build ``AuthUserOut`` from JWT in ``request.state`` (after ``authenticate_request``)."""
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str):
        raise http_error(request, 401, "INVALID_TOKEN")
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
    if settings.auth_mode == "local":
        u = await db.get(User, sub)
        if u:
            perm_set = await resolve_user_permission_keys(db, sub)
            perms = sorted(perm_set)
        else:
            perms = []
    elif is_admin:
        perms = await sorted_permission_keys(db)
    else:
        perm_set = await resolve_oidc_permission_keys(db, p)
        perms = sorted(perm_set)
    ui_loc = await _pref_ui_locale(db, sub)
    default_project = await _pref_default_agent_project_id(db, sub)
    return AuthUserOut(
        id=sub,
        email=email or "",
        username=username,
        is_admin=is_admin,
        roles=role_strs,
        permissions=perms,
        ui_locale=ui_loc,
        default_agent_project_id=default_project,
    )


@api_auth_router.post("/refresh")
async def refresh_auth_session(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Rotate/refresh the server-side session before the access token expires."""
    _require_same_origin(request)
    if not settings.auth_session_v2:
        raise http_error(request, 404, "AUTH_SESSION_V2_DISABLED")
    session_id = request.session.get("auth_sid")
    if not isinstance(session_id, str) or not session_id:
        raise http_error(request, 401, "AUTHENTICATION_REQUIRED")
    row = await auth_sessions.get_session(db, session_id)
    if row is None or not auth_sessions.session_active(row):
        if row is not None:
            await auth_sessions.revoke_session(db, row)
        request.session.pop("auth_sid", None)
        raise http_error(request, 401, "AUTHENTICATION_REQUIRED")
    if not await auth_sessions.refresh_session(db, row):
        await auth_sessions.revoke_session(db, row)
        request.session.pop("auth_sid", None)
        raise http_error(request, 401, "AUTHENTICATION_REQUIRED")
    await db.commit()
    return {
        "ok": True,
        "idle_expires_at": row.idle_expires_at.isoformat(),
        "absolute_expires_at": row.absolute_expires_at.isoformat(),
    }


@api_auth_router.get("/me", response_model=AuthUserOut)
async def auth_me(request: Request, db: AsyncSession = Depends(get_db)):
    await authenticate_request(request, db)
    from app.services.identity.users.oidc_identity_service import upsert_oidc_identity_from_jwt

    await upsert_oidc_identity_from_jwt(db, request.state.openkms_jwt_payload)
    await db.commit()
    return await build_auth_user_out(request, db)


@api_auth_router.patch("/me", response_model=AuthUserOut)
async def patch_auth_me(request: Request, body: MePatchBody, db: AsyncSession = Depends(get_db)):
    await authenticate_request(request, db)
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or sub == "local-cli":
        raise http_error(request, 403, "CANNOT_EDIT_PROFILE_PRINCIPAL")
    if body.ui_locale is not None:
        await _save_pref_ui_locale(db, sub, body.ui_locale)
    if "default_agent_project_id" in body.model_fields_set:
        try:
            await _save_pref_default_agent_project(db, sub, body.default_agent_project_id)
        except LookupError:
            raise http_error(request, 404, "PROJECT_NOT_FOUND") from None
        except ValueError:
            raise http_error(request, 400, "INVALID_DEFAULT_AGENT_PROJECT") from None
    if body.new_password is not None:
        if settings.auth_mode != "local":
            raise http_error(request, 403, "PASSWORD_CHANGE_LOCAL_ONLY")
        u = await db.get(User, sub)
        if u is None:
            raise http_error(request, 404, "USER_NOT_FOUND")
        if not _verify_password(body.current_password, u.password_hash):
            raise http_error(request, 400, "CURRENT_PASSWORD_INCORRECT")
        u.password_hash = _hash_password(body.new_password)
        await db.flush()
    await db.commit()
    return await build_auth_user_out(request, db)


@api_auth_router.post("/logout")
async def logout_json(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Clear server session (local or oidc); client should discard Bearer token."""
    _require_same_origin(request)
    session_id = request.session.get("auth_sid")
    if isinstance(session_id, str) and session_id:
        row = await auth_sessions.get_session(db, session_id)
        if row is not None:
            await auth_sessions.revoke_session(db, row)
            await db.commit()
    request.session.clear()
    return {"ok": True}
