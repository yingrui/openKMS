"""Create and revoke personal / session API keys."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

import bcrypt
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.models.user_api_key import UserApiKey
from app.services.permissions.permission_resolution import jwt_realm_role_names

ApiKeyPurpose = Literal["personal", "agent_session"]


def hash_api_key_secret(secret: str) -> str:
    return bcrypt.hashpw(secret.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


async def mint_user_api_key(
    db: AsyncSession,
    *,
    owner_sub: str,
    jwt_payload: dict[str, Any],
    name: str,
    purpose: ApiKeyPurpose = "personal",
    agent_conversation_id: str | None = None,
) -> tuple[UserApiKey, str]:
    """Create a UserApiKey row and return (row, full_token okms.{id}.{secret})."""
    key_id = str(uuid4())
    secret = secrets.token_urlsafe(32)
    full_token = f"okms.{key_id}.{secret}"

    if settings.auth_mode == "local":
        u = await db.get(User, owner_sub)
        disp_u = u.username if u else ""
        disp_e = u.email if u else ""
        oidc_roles = None
        mode = "local"
    else:
        disp_u = str(jwt_payload.get("preferred_username") or jwt_payload.get("name") or "user")
        de = jwt_payload.get("email")
        disp_e = str(de) if isinstance(de, str) else ""
        oidc_roles = sorted(jwt_realm_role_names(jwt_payload))
        mode = "oidc"

    row = UserApiKey(
        id=key_id,
        owner_sub=owner_sub,
        auth_mode=mode,
        name=name[:128],
        key_prefix=f"okms.{key_id[:8]}",
        secret_hash=hash_api_key_secret(secret),
        oidc_realm_roles=oidc_roles,
        display_username=disp_u[:256],
        display_email=disp_e[:320],
        purpose=purpose,
        agent_conversation_id=agent_conversation_id,
    )
    db.add(row)
    await db.flush()
    return row, full_token


async def revoke_user_api_key(db: AsyncSession, key_id: str) -> None:
    row = await db.get(UserApiKey, key_id)
    if row is None or row.revoked_at is not None:
        return
    row.revoked_at = datetime.now(timezone.utc)
    await db.flush()
