"""Aggregated data for the signed-in home (platform operations center)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_jwt_payload
from app.database import get_db
from app.models.article import Article
from app.models.document import Document
from app.models.knowledge_base import KnowledgeBase
from app.models.project import Project
from app.models.user_preference import UserPreference
from app.models.wiki_models import WikiPage

router = APIRouter(prefix="/home", tags=["home"])


class SiteSummary(BaseModel):
    document_count: int
    kb_count: int
    wiki_page_count: int
    article_count: int


class HomeDefaultAgentProject(BaseModel):
    id: str
    name: str


class HomeHubResponse(BaseModel):
    site_summary: SiteSummary
    default_agent_project: HomeDefaultAgentProject | None = None


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


async def _load_default_agent_project(
    db: AsyncSession, sub: str
) -> HomeDefaultAgentProject | None:
    pref = await db.get(UserPreference, sub)
    if pref is None or not pref.default_agent_project_id:
        return None
    pid = pref.default_agent_project_id.strip()
    if not pid:
        return None
    project = await db.get(Project, pid)
    if project is None or project.user_sub != sub:
        return None
    return HomeDefaultAgentProject(id=project.id, name=project.name)


@router.get("/hub", response_model=HomeHubResponse)
async def get_home_hub(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_jwt_payload),
):
    sub = payload.get("sub")
    default_project = None
    if isinstance(sub, str) and sub:
        default_project = await _load_default_agent_project(db, sub)
    return HomeHubResponse(
        site_summary=await _load_site_summary(db),
        default_agent_project=default_project,
    )
