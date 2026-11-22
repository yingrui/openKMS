"""Reading back the votes a reader has cast.

The conversation screen has to show a thumb as pressed after a reload, or the control stops meaning anything: a vote
you cannot see is a vote you cannot trust, and pressing twice would look like the first press never landed.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workforce_agent import WorkforceAnswerFeedback


async def votes_for_messages(
    db: AsyncSession, message_ids: list[str], *, actor_sub: str | None
) -> dict[str, str]:
    """`message_id → vote` for the messages this reader has voted on."""
    if not message_ids or not actor_sub:
        return {}
    rows = (
        await db.execute(
            select(WorkforceAnswerFeedback.message_id, WorkforceAnswerFeedback.vote).where(
                WorkforceAnswerFeedback.message_id.in_(message_ids),
                WorkforceAnswerFeedback.actor_sub == actor_sub,
            )
        )
    ).all()
    return {str(message_id): str(vote) for message_id, vote in rows}
