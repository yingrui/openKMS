"""Aggregated data for the signed-in home (platform operations center)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.article import Article
from app.models.document import Document
from app.models.knowledge_base import KnowledgeBase
from app.models.wiki_models import WikiPage

router = APIRouter(prefix="/home", tags=["home"])


class SiteSummary(BaseModel):
    document_count: int
    kb_count: int
    wiki_page_count: int
    article_count: int


class HomeHubResponse(BaseModel):
    site_summary: SiteSummary


async def _load_site_summary(db: AsyncSession) -> SiteSummary:
    document_count = await db.scalar(select(sa_func.count()).select_from(Document)) or 0
    kb_count = await db.scalar(select(sa_func.count()).select_from(KnowledgeBase)) or 0
    wiki_page_count = await db.scalar(select(sa_func.count()).select_from(WikiPage)) or 0
    article_count = await db.scalar(select(sa_func.count()).select_from(Article)) or 0
    return SiteSummary(
        document_count=int(document_count),
        kb_count=int(kb_count),
        wiki_page_count=int(wiki_page_count),
        article_count=int(article_count),
    )


@router.get(
    "/hub",
    response_model=HomeHubResponse,
    dependencies=[Depends(require_auth)],
)
async def get_home_hub(db: AsyncSession = Depends(get_db)):
    return HomeHubResponse(site_summary=await _load_site_summary(db))
