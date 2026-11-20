"""Which connector, if any, can search the web.

The lookup lives here rather than in the internal API because two callers need it: the endpoint that runs a search, and
the tools catalogue that tells a screen whether the capability is usable. Importing one API module from the other would
close a cycle across `app/api`.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connector import Connector

#: Connector kinds that provide web search. One enabled connector is enough; the first one wins.
WEB_SEARCH_KINDS = ("zhipu_web_search",)


async def web_search_connector(db: AsyncSession) -> Connector | None:
    """The enabled connector that can search the web, if the deployment has one."""
    return (
        await db.execute(
            select(Connector)
            .where(Connector.kind.in_(WEB_SEARCH_KINDS), Connector.enabled.is_(True))
            .order_by(Connector.created_at)
            .limit(1)
        )
    ).scalars().first()
