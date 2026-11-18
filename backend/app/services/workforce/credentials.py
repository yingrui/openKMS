"""Mint and verify workforce agent credentials (`wfks.{credential_id}.{secret}`).

A credential belongs to an agent, not to a person. That is what makes it revocable on its own: an
integrator losing their token does not force the owner to rotate their personal API key, and the
owner's own access never depends on an agent's credential existing.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from uuid import uuid4

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_maker

from app.models.workforce_agent import (
    AGENT_STATUS_ACTIVE,
    WorkforceAgent,
    WorkforceAgentCredential,
)

TOKEN_PREFIX = "wfks"


def is_credential_token(token: str) -> bool:
    return token.startswith(f"{TOKEN_PREFIX}.") and token.count(".") == 2


def _hash_secret(secret: str) -> str:
    return bcrypt.hashpw(secret.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_secret(secret: str, secret_hash: str) -> bool:
    try:
        return bcrypt.checkpw(secret.encode("utf-8"), secret_hash.encode("utf-8"))
    except ValueError:
        return False


async def mint_credential(
    db: AsyncSession,
    *,
    agent_id: str,
    name: str,
    auth_mode: str,
    oidc_realm_roles: list[str] | None = None,
) -> tuple[WorkforceAgentCredential, str]:
    """Create a credential row and return (row, full token). The token is not recoverable later."""
    credential_id = str(uuid4())
    secret = secrets.token_urlsafe(32)
    row = WorkforceAgentCredential(
        id=credential_id,
        agent_id=agent_id,
        name=name[:128],
        key_prefix=f"{TOKEN_PREFIX}.{credential_id[:8]}",
        secret_hash=_hash_secret(secret),
        auth_mode=auth_mode,
        oidc_realm_roles=oidc_realm_roles,
    )
    db.add(row)
    await db.flush()
    return row, f"{TOKEN_PREFIX}.{credential_id}.{secret}"


async def verify_credential(
    db: AsyncSession, token: str
) -> tuple[WorkforceAgent, WorkforceAgentCredential] | None:
    """Resolve a token to (agent, credential), or None.

    A revoked credential, an archived agent, or a credential whose owner no longer resolves all
    read the same way to the caller: not authenticated.
    """
    if not is_credential_token(token):
        return None
    _, credential_id, secret = token.split(".", 2)
    row = await db.get(WorkforceAgentCredential, credential_id)
    if row is None or row.revoked_at is not None:
        return None
    if not _verify_secret(secret, row.secret_hash):
        return None
    agent = await db.get(WorkforceAgent, row.agent_id)
    if agent is None or agent.status != AGENT_STATUS_ACTIVE:
        return None
    return agent, row


async def touch_credential(credential_id: str) -> None:
    """Record "last used" in its own transaction.

    Flushing it on the request session would hold a row lock until the handler finishes, and a service
    call that fans out (qa-agent calling back with the same credential) then deadlocks on itself. Same
    rule as a personal API key.
    """
    async with async_session_maker() as db:
        row = await db.get(WorkforceAgentCredential, credential_id)
        if row is not None and row.revoked_at is None:
            row.last_used_at = datetime.now(timezone.utc)
            await db.commit()


async def revoked_credential_ids(db: AsyncSession, agent_id: str) -> set[str]:
    rows = await db.execute(
        select(WorkforceAgentCredential.id).where(WorkforceAgentCredential.agent_id == agent_id)
    )
    return {str(r[0]) for r in rows.all()}
