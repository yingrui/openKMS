"""Server-side browser session lifecycle for the BFF auth path.

The cookie carries only `AuthSession.id`; access/refresh tokens are encrypted at rest. A session has both a
sliding idle deadline and a hard absolute deadline, so activity can extend the former but never the latter.
"""

from __future__ import annotations

import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import jwt
from sqlalchemy import delete, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.auth_session import AuthSession
from app.models.user import User
from app.oidc_discovery import get_oidc_provider_metadata
from app.services.platform.credentials.credential_encryption import decrypt, encrypt

TOUCH_INTERVAL_SECONDS = 60
REFRESH_SKEW_SECONDS = 60
SESSION_ROTATION_GRACE_SECONDS = 15


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_session_id() -> str:
    return secrets.token_urlsafe(32)


def token_expiry(access_token: str, expires_in: Any = None) -> datetime:
    """Return the access-token expiry, preferring the token response's ``expires_in``."""
    now = utcnow()
    if isinstance(expires_in, (int, float)) and expires_in > 0:
        return now + timedelta(seconds=float(expires_in))
    try:
        payload = jwt.decode(access_token, options={"verify_signature": False})
        exp = payload.get("exp")
        if isinstance(exp, (int, float)) and exp > 0:
            return datetime.fromtimestamp(float(exp), tz=timezone.utc)
    except (jwt.PyJWTError, ValueError, TypeError):
        pass
    return now + timedelta(minutes=5)


def session_active(row: AuthSession, now: datetime | None = None) -> bool:
    now = now or utcnow()
    if row.revoked_at is not None:
        return False
    return row.idle_expires_at > now and row.absolute_expires_at > now


async def get_session(db: AsyncSession, session_id: str) -> AuthSession | None:
    return await db.get(AuthSession, session_id)


async def cleanup_expired_sessions(db: AsyncSession, *, retain_days: int = 30) -> int:
    """Delete sessions that expired/revoked long ago; bounded by the next login's transaction."""
    cutoff = utcnow() - timedelta(days=retain_days)
    result = await db.execute(
        delete(AuthSession).where(
            or_(AuthSession.idle_expires_at < cutoff, AuthSession.revoked_at < cutoff)
        )
    )
    return int(result.rowcount or 0)


_LAST_CLEANUP_AT = 0.0


async def _maybe_cleanup(db: AsyncSession) -> None:
    global _LAST_CLEANUP_AT
    now = time.monotonic()
    if now - _LAST_CLEANUP_AT < 3600:
        return
    _LAST_CLEANUP_AT = now
    try:
        async with db.begin_nested():
            await cleanup_expired_sessions(db)
    except SQLAlchemyError:
        # Housekeeping must never block a sign-in.
        pass


async def create_session(
    db: AsyncSession,
    *,
    auth_mode: str,
    user_sub: str,
    idp_sub: str | None,
    access_token: str,
    refresh_token: str | None,
    access_expires_at: datetime,
    absolute_expires_at: datetime | None = None,
    rotated_from: str | None = None,
) -> AuthSession:
    await _maybe_cleanup(db)
    now = utcnow()
    absolute = absolute_expires_at or (now + timedelta(hours=settings.session_absolute_hours))
    idle = min(now + timedelta(minutes=settings.session_idle_minutes), absolute)
    row = AuthSession(
        id=new_session_id(),
        user_sub=user_sub,
        idp_sub=idp_sub,
        auth_mode=auth_mode,
        access_token_enc=encrypt(access_token),
        refresh_token_enc=encrypt(refresh_token) if refresh_token else None,
        access_expires_at=access_expires_at,
        idle_expires_at=idle,
        absolute_expires_at=absolute,
        rotated_from=rotated_from,
        created_at=now,
        last_seen_at=now,
    )
    db.add(row)
    await db.flush()
    return row


async def update_session_access_token(
    db: AsyncSession,
    row: AuthSession,
    *,
    access_token: str,
    access_expires_at: datetime,
    refresh_token: str | None = None,
) -> None:
    row.access_token_enc = encrypt(access_token)
    row.access_expires_at = access_expires_at
    if refresh_token:
        row.refresh_token_enc = encrypt(refresh_token)
    await db.flush()


async def touch_session(db: AsyncSession, row: AuthSession) -> None:
    """Extend the idle deadline, throttled so a busy page does not write on every request."""
    now = utcnow()
    if (now - row.last_seen_at).total_seconds() < TOUCH_INTERVAL_SECONDS:
        return
    row.last_seen_at = now
    row.idle_expires_at = min(
        now + timedelta(minutes=settings.session_idle_minutes),
        row.absolute_expires_at,
    )
    await db.flush()


async def rotated_successor(db: AsyncSession, row: AuthSession) -> AuthSession | None:
    """Follow a just-rotated session id so concurrent in-flight requests do not get logged out."""
    if row.revoked_at is None or not row.replaced_by:
        return None
    if (utcnow() - row.revoked_at).total_seconds() > SESSION_ROTATION_GRACE_SECONDS:
        return None
    successor = await get_session(db, row.replaced_by)
    return successor if successor is not None and session_active(successor) else None


async def rotate_session(db: AsyncSession, row: AuthSession) -> AuthSession | None:
    """Create a successor row for an explicit refresh and revoke the old row."""
    if not session_active(row):
        return None
    now = utcnow()
    successor = AuthSession(
        id=new_session_id(),
        user_sub=row.user_sub,
        idp_sub=row.idp_sub,
        auth_mode=row.auth_mode,
        access_token_enc=row.access_token_enc,
        refresh_token_enc=row.refresh_token_enc,
        access_expires_at=row.access_expires_at,
        idle_expires_at=min(now + timedelta(minutes=settings.session_idle_minutes), row.absolute_expires_at),
        absolute_expires_at=row.absolute_expires_at,
        created_at=now,
        last_seen_at=now,
        rotated_from=row.id,
    )
    row.revoked_at = now
    row.replaced_by = successor.id
    db.add(successor)
    await db.flush()
    return successor


async def revoke_session(db: AsyncSession, row: AuthSession) -> None:
    if row.revoked_at is None:
        row.revoked_at = utcnow()
        await db.flush()


async def revoke_user_sessions(db: AsyncSession, user_sub: str) -> None:
    rows = (
        await db.execute(select(AuthSession).where(AuthSession.user_sub == user_sub))
    ).scalars().all()
    now = utcnow()
    for row in rows:
        if row.revoked_at is None:
            row.revoked_at = now
    await db.flush()


async def _refresh_oidc(row: AuthSession) -> bool:
    refresh_token = decrypt(row.refresh_token_enc) if row.refresh_token_enc else ""
    if not refresh_token:
        return False
    meta = get_oidc_provider_metadata()
    token_endpoint = meta.get("token_endpoint")
    if not token_endpoint:
        return False
    data = {
        "grant_type": "refresh_token",
        "client_id": settings.oidc_client_id,
        "refresh_token": refresh_token,
    }
    if settings.oidc_client_secret:
        data["client_secret"] = settings.oidc_client_secret
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(
            token_endpoint,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if res.status_code != 200:
        return False
    payload = res.json()
    access_token = payload.get("access_token")
    if not isinstance(access_token, str) or not access_token.strip():
        return False
    new_refresh = payload.get("refresh_token")
    row.access_token_enc = encrypt(access_token.strip())
    if isinstance(new_refresh, str) and new_refresh.strip():
        row.refresh_token_enc = encrypt(new_refresh.strip())
    row.access_expires_at = token_expiry(access_token.strip(), payload.get("expires_in"))
    return True


async def _refresh_local(db: AsyncSession, row: AuthSession) -> bool:
    user = await db.get(User, row.user_sub)
    if user is None:
        return False
    from app.services.identity.local_jwt import mint_local_user_jwt

    token = mint_local_user_jwt(user, ttl_minutes=settings.local_session_jwt_minutes)
    row.access_token_enc = encrypt(token)
    row.access_expires_at = utcnow() + timedelta(minutes=settings.local_session_jwt_minutes)
    return True


async def refresh_session(db: AsyncSession, row: AuthSession, *, force: bool = False) -> bool:
    """Refresh the access token in place, serialized across concurrent requests.

    ``force`` is for an explicit user/API refresh. Automatic expiry checks skip a
    refresh when another request already obtained a fresh token while we waited
    on the row lock.
    """
    await db.execute(select(AuthSession).where(AuthSession.id == row.id).with_for_update())
    await db.refresh(row)
    if not session_active(row):
        return False
    if not force and row.access_expires_at > utcnow() + timedelta(seconds=REFRESH_SKEW_SECONDS):
        return True
    if row.auth_mode == "local":
        ok = await _refresh_local(db, row)
    else:
        ok = await _refresh_oidc(row)
    if ok:
        await touch_session(db, row)
        await db.flush()
    return ok


def access_token_of(row: AuthSession) -> str:
    return decrypt(row.access_token_enc)
