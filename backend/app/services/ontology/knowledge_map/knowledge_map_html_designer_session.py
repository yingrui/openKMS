"""Persist Knowledge Map HTML Designer chat using ``agent_conversations`` / ``agent_messages``."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_models import AgentConversation, AgentMessage

logger = logging.getLogger(__name__)

MAP_HTML_DESIGNER_SURFACE = "knowledge_map_html"


async def get_designer_conversation_owned(
    db: AsyncSession, user_sub: str, conversation_id: str
) -> AgentConversation | None:
    c = await db.get(AgentConversation, conversation_id)
    if not c or c.user_sub != user_sub or c.surface != MAP_HTML_DESIGNER_SURFACE:
        return None
    return c


async def list_designer_conversations(db: AsyncSession, user_sub: str, *, limit: int = 50) -> list[AgentConversation]:
    r = await db.execute(
        select(AgentConversation)
        .where(
            AgentConversation.user_sub == user_sub,
            AgentConversation.surface == MAP_HTML_DESIGNER_SURFACE,
        )
        .order_by(AgentConversation.updated_at.desc())
        .limit(limit)
    )
    return list(r.scalars().all())


async def create_designer_conversation(db: AsyncSession, user_sub: str) -> AgentConversation:
    c = AgentConversation(
        user_sub=user_sub,
        surface=MAP_HTML_DESIGNER_SURFACE,
        context={},
        title=None,
    )
    db.add(c)
    await db.flush()
    return c


async def get_or_create_latest_designer_conversation(db: AsyncSession, user_sub: str) -> AgentConversation:
    """Legacy: single-thread clients without ``conversation_id`` — use most recently updated row or create."""
    r = await db.execute(
        select(AgentConversation)
        .where(
            AgentConversation.user_sub == user_sub,
            AgentConversation.surface == MAP_HTML_DESIGNER_SURFACE,
        )
        .order_by(AgentConversation.updated_at.desc())
        .limit(1)
    )
    c = r.scalar_one_or_none()
    if c:
        return c
    return await create_designer_conversation(db, user_sub)


async def get_designer_session_messages(
    db: AsyncSession, user_sub: str, conversation_id: str | None
) -> tuple[str | None, list[AgentMessage]]:
    conv: AgentConversation | None = None
    if conversation_id:
        conv = await get_designer_conversation_owned(db, user_sub, conversation_id)
        if not conv:
            return None, []
    else:
        r = await db.execute(
            select(AgentConversation)
            .where(
                AgentConversation.user_sub == user_sub,
                AgentConversation.surface == MAP_HTML_DESIGNER_SURFACE,
            )
            .order_by(AgentConversation.updated_at.desc())
            .limit(1)
        )
        conv = r.scalar_one_or_none()
    if not conv:
        return None, []
    m = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conv.id)
        .order_by(AgentMessage.created_at.asc())
    )
    return conv.id, list(m.scalars().all())


async def append_designer_turn(
    db: AsyncSession,
    user_sub: str,
    user_content: str,
    assistant_content: str,
    conversation_id: str | None,
) -> None:
    if conversation_id:
        c = await get_designer_conversation_owned(db, user_sub, conversation_id)
        if not c:
            raise ValueError("designer conversation not found")
    else:
        c = await get_or_create_latest_designer_conversation(db, user_sub)
    db.add(AgentMessage(conversation_id=c.id, role="user", content=user_content))
    db.add(AgentMessage(conversation_id=c.id, role="assistant", content=assistant_content))
    if not (c.title and c.title.strip()):
        t = user_content.strip().replace("\n", " ")
        if t:
            c.title = f"{t[:100]}…" if len(t) > 100 else t
    c.updated_at = datetime.now(timezone.utc)
    await db.flush()


async def delete_designer_conversation(db: AsyncSession, user_sub: str, conversation_id: str) -> bool:
    c = await get_designer_conversation_owned(db, user_sub, conversation_id)
    if not c:
        return False
    await db.delete(c)
    await db.flush()
    return True


async def persist_designer_turn_safe(
    user_sub: str, user_content: str, assistant_content: str, conversation_id: str | None
) -> None:
    """Separate session for stream path (request DB may be committed before stream ends)."""
    from app.database import async_session_maker

    try:
        async with async_session_maker() as db:
            await append_designer_turn(db, user_sub, user_content, assistant_content, conversation_id)
            await db.commit()
    except Exception:
        logger.exception("Knowledge Map HTML designer session persist failed for sub=%s", user_sub[:32])
