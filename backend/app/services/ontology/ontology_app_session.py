"""Persist Ontology App Designer chat on agent_conversations (per app_id)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_models import AgentConversation, AgentMessage

logger = logging.getLogger(__name__)

ONTOLOGY_APP_DESIGNER_SURFACE = "ontology_app_designer"


async def get_app_conversation_owned(
    db: AsyncSession, user_sub: str, conversation_id: str, app_id: str
) -> AgentConversation | None:
    c = await db.get(AgentConversation, conversation_id)
    if (
        not c
        or c.user_sub != user_sub
        or c.surface != ONTOLOGY_APP_DESIGNER_SURFACE
        or (c.context or {}).get("app_id") != app_id
    ):
        return None
    return c


async def list_app_conversations(
    db: AsyncSession, user_sub: str, app_id: str, *, limit: int = 50
) -> list[AgentConversation]:
    r = await db.execute(
        select(AgentConversation)
        .where(
            AgentConversation.user_sub == user_sub,
            AgentConversation.surface == ONTOLOGY_APP_DESIGNER_SURFACE,
        )
        .order_by(AgentConversation.updated_at.desc())
        .limit(limit * 3)
    )
    rows = [c for c in r.scalars().all() if (c.context or {}).get("app_id") == app_id]
    return rows[:limit]


async def create_app_conversation(db: AsyncSession, user_sub: str, app_id: str) -> AgentConversation:
    c = AgentConversation(
        user_sub=user_sub,
        surface=ONTOLOGY_APP_DESIGNER_SURFACE,
        context={"app_id": app_id},
        title=None,
    )
    db.add(c)
    await db.flush()
    return c


async def get_app_session_messages(
    db: AsyncSession, user_sub: str, app_id: str, conversation_id: str | None
) -> tuple[str | None, list[AgentMessage]]:
    conv: AgentConversation | None = None
    if conversation_id:
        conv = await get_app_conversation_owned(db, user_sub, conversation_id, app_id)
        if not conv:
            return None, []
    else:
        rows = await list_app_conversations(db, user_sub, app_id, limit=1)
        conv = rows[0] if rows else None
    if not conv:
        return None, []
    m = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conv.id)
        .order_by(AgentMessage.created_at.asc())
    )
    return conv.id, list(m.scalars().all())


async def append_app_turn(
    db: AsyncSession,
    user_sub: str,
    app_id: str,
    user_content: str,
    assistant_content: str,
    conversation_id: str | None,
) -> None:
    if conversation_id:
        c = await get_app_conversation_owned(db, user_sub, conversation_id, app_id)
        if not c:
            raise ValueError("designer conversation not found")
    else:
        rows = await list_app_conversations(db, user_sub, app_id, limit=1)
        c = rows[0] if rows else await create_app_conversation(db, user_sub, app_id)
    db.add(AgentMessage(conversation_id=c.id, role="user", content=user_content))
    db.add(AgentMessage(conversation_id=c.id, role="assistant", content=assistant_content))
    if not (c.title and c.title.strip()):
        t = user_content.strip().replace("\n", " ")
        if t:
            c.title = f"{t[:100]}…" if len(t) > 100 else t
    c.updated_at = datetime.now(timezone.utc)
    await db.flush()


async def delete_app_conversation(db: AsyncSession, user_sub: str, app_id: str, conversation_id: str) -> bool:
    c = await get_app_conversation_owned(db, user_sub, conversation_id, app_id)
    if not c:
        return False
    await db.delete(c)
    await db.flush()
    return True


async def delete_all_conversations_for_app(db: AsyncSession, app_id: str) -> int:
    """Remove designer chats for an app (all users). Call before deleting the app row."""
    r = await db.execute(
        select(AgentConversation).where(AgentConversation.surface == ONTOLOGY_APP_DESIGNER_SURFACE)
    )
    rows = [c for c in r.scalars().all() if (c.context or {}).get("app_id") == app_id]
    for c in rows:
        await db.delete(c)
    if rows:
        await db.flush()
    return len(rows)

async def persist_app_turn_safe(
    user_sub: str, app_id: str, user_content: str, assistant_content: str, conversation_id: str | None
) -> None:
    from app.database import async_session_maker

    try:
        async with async_session_maker() as db:
            await append_app_turn(db, user_sub, app_id, user_content, assistant_content, conversation_id)
            await db.commit()
    except Exception:
        logger.exception("Ontology App designer persist failed for sub=%s", user_sub[:32])
