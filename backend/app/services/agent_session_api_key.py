"""Per-conversation API keys for project agents (represents session creator)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_models import AgentConversation
from app.services.credential_crypto import decrypt_secret, encrypt_secret
from app.services.user_api_key_service import mint_user_api_key, revoke_user_api_key

_CTX_KEY_ID = "session_api_key_id"
_CTX_TOKEN_ENC = "session_api_key_encrypted"


def get_session_bearer_token(conversation: AgentConversation) -> str | None:
    ctx = conversation.context if isinstance(conversation.context, dict) else {}
    enc = ctx.get(_CTX_TOKEN_ENC)
    if not isinstance(enc, str) or not enc.strip():
        return None
    try:
        return decrypt_secret(enc)
    except ValueError:
        return None


async def ensure_session_api_key(
    db: AsyncSession,
    conversation: AgentConversation,
    jwt_payload: dict[str, Any],
) -> str:
    """Mint or return existing session API key bearer token."""
    existing = get_session_bearer_token(conversation)
    if existing:
        return existing

    _row, full_token = await mint_user_api_key(
        db,
        owner_sub=conversation.user_sub,
        jwt_payload=jwt_payload,
        name=f"agent-session:{conversation.id[:8]}",
        purpose="agent_session",
        agent_conversation_id=conversation.id,
    )
    ctx = dict(conversation.context or {})
    ctx[_CTX_KEY_ID] = _row.id
    ctx[_CTX_TOKEN_ENC] = encrypt_secret(full_token)
    conversation.context = ctx
    await db.flush()
    return full_token


async def revoke_session_api_key(db: AsyncSession, conversation: AgentConversation) -> None:
    ctx = conversation.context if isinstance(conversation.context, dict) else {}
    key_id = ctx.get(_CTX_KEY_ID)
    if isinstance(key_id, str) and key_id.strip():
        await revoke_user_api_key(db, key_id)
