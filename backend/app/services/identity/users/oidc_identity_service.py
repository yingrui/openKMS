"""Persist OIDC JWT claims on login for sub → display name resolution."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.oidc_identity import OidcIdentity


def _display_username_from_claims(payload: dict[str, Any]) -> str:
    for key in ("preferred_username", "name", "nickname"):
        v = payload.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()[:256]
    return "user"


def _email_from_claims(payload: dict[str, Any]) -> str | None:
    v = payload.get("email")
    if isinstance(v, str) and v.strip():
        return v.strip()[:320]
    return None


def _name_from_claims(payload: dict[str, Any]) -> str | None:
    v = payload.get("name")
    if isinstance(v, str) and v.strip():
        return v.strip()[:256]
    return None


def should_upsert_oidc_identity(payload: dict[str, Any]) -> bool:
    if settings.auth_mode != "oidc":
        return False
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub.strip() or sub == "local-cli":
        return False
    if payload.get("openkms_auth_via") == "api_key":
        return False
    return True


async def upsert_oidc_identity_from_jwt(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Upsert identity row from a verified OIDC access token (browser login / sync-session /me)."""
    if not should_upsert_oidc_identity(payload):
        return
    sub = str(payload["sub"]).strip()
    username = _display_username_from_claims(payload)
    email = _email_from_claims(payload)
    display_name = _name_from_claims(payload)
    now = datetime.now(timezone.utc)

    row = await db.get(OidcIdentity, sub)
    if row is None:
        db.add(
            OidcIdentity(
                sub=sub,
                preferred_username=username,
                email=email,
                name=display_name,
                first_seen_at=now,
                last_seen_at=now,
            )
        )
        return

    row.preferred_username = username
    row.email = email
    row.name = display_name
    row.last_seen_at = now


async def lookup_oidc_sub_by_alias(db: AsyncSession, raw: str) -> str | None:
    """Resolve username or email to OIDC sub from the login directory."""
    if settings.auth_mode != "oidc":
        return None
    term = (raw or "").strip()
    if not term:
        return None
    lowered = term.lower()
    r = await db.execute(
        select(OidcIdentity.sub)
        .where(
            or_(
                func.lower(OidcIdentity.preferred_username) == lowered,
                func.lower(OidcIdentity.email) == lowered,
            )
        )
        .order_by(OidcIdentity.last_seen_at.desc())
        .limit(1)
    )
    return r.scalar_one_or_none()


async def display_label_for_oidc_sub(db: AsyncSession, sub: str) -> str | None:
    row = await db.get(OidcIdentity, sub.strip())
    if not row:
        return None
    if row.preferred_username and row.preferred_username.strip():
        return row.preferred_username.strip()
    if row.name and row.name.strip():
        return row.name.strip()
    if row.email and row.email.strip():
        return row.email.strip()
    return None
