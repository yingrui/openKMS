"""Local-mode JWT minting.

Kept below ``app/services`` so both the auth API and the session service can import it without an
``app/api`` <-> ``app/services`` import cycle.
"""

from __future__ import annotations

import time

import jwt

from app.config import settings
from app.models.user import User

LOCAL_JWT_ALG = "HS256"
LOCAL_JWT_ISS = "openkms-local"


def user_claims(user: User) -> dict:
    roles = ["admin"] if user.is_admin else []
    return {
        "sub": str(user.id),
        "preferred_username": user.username,
        "name": user.username,
        "email": user.email,
        "realm_access": {"roles": roles},
    }


def mint_local_user_jwt(user: User, ttl_minutes: int | None = None) -> str:
    now = int(time.time())
    ttl_seconds = int(ttl_minutes * 60) if ttl_minutes else int(settings.local_jwt_exp_hours * 3600)
    exp = now + ttl_seconds
    payload = {**user_claims(user), "iss": LOCAL_JWT_ISS, "iat": now, "exp": exp}
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
        "azp": settings.primary_internal_service_client_id,
        "iss": LOCAL_JWT_ISS,
        "iat": now,
        "exp": exp,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=LOCAL_JWT_ALG)
