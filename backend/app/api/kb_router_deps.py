"""Shared FastAPI dependencies for knowledge-base route modules."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.knowledge_base import KnowledgeBase
from app.models.kb_wiki_space import KBWikiSpace
from app.models.wiki_models import WikiPage
from app.services.kb_scope import (
    load_knowledge_base_scoped,
    require_knowledge_base_write,
)
from app.services.resource_acl_constants import PERM_READ


async def _get_kb_or_404(
    kb_id: str,
    request: Request,
    db: AsyncSession,
) -> KnowledgeBase:
    return await load_knowledge_base_scoped(db, request, kb_id, PERM_READ)


async def get_kb_scoped(
    kb_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> KnowledgeBase:
    return await _get_kb_or_404(kb_id, request, db)


async def get_kb_scoped_write(
    kb_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> KnowledgeBase:
    kb = await _get_kb_or_404(kb_id, request, db)
    return await require_knowledge_base_write(db, request, kb)


async def ensure_wiki_page_in_kb_wiki_spaces(db: AsyncSession, kb_id: str, wiki_page_id: str) -> None:
    r = await db.execute(
        select(WikiPage.id)
        .join(KBWikiSpace, KBWikiSpace.wiki_space_id == WikiPage.wiki_space_id)
        .where(KBWikiSpace.knowledge_base_id == kb_id, WikiPage.id == wiki_page_id)
    )
    if r.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=400,
            detail="Wiki page is not in a wiki space linked to this knowledge base",
        )


def propagate_metadata(doc_metadata: dict | None, metadata_keys: list | None) -> dict | None:
    """Filter document metadata by KB config. Returns filtered doc_metadata."""
    if not metadata_keys:
        return None
    filtered = {k: v for k, v in (doc_metadata or {}).items() if k in metadata_keys}
    return filtered if filtered else None
