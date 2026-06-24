"""ACL checks for comment targets across resource kinds."""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_jwt_sub
from app.models.project import Project
from app.services.articles.article_scope import load_article_scoped
from app.services.comments.comment_resource_types import (
    COMMENT_RESOURCE_TYPES,
    COMMENT_RT_ARTICLE,
    COMMENT_RT_DOCUMENT,
    COMMENT_RT_KNOWLEDGE_BASE,
    COMMENT_RT_PROJECT,
    COMMENT_RT_WIKI_SPACE,
)
from app.services.documents.document_scope import load_document_scoped
from app.services.feature_toggles import is_feature_enabled
from app.services.knowledge_bases.kb_scope import load_knowledge_base_scoped
from app.services.acl.resource_acl_constants import PERM_READ
from app.services.wiki.wiki_scope import load_wiki_space_scoped


def validate_resource_type(resource_type: str) -> str:
    rt = (resource_type or "").strip().lower()
    if rt not in COMMENT_RESOURCE_TYPES:
        raise HTTPException(status_code=422, detail=f"Unsupported resource_type: {resource_type}")
    return rt


async def ensure_comment_resource_readable(
    db: AsyncSession,
    request: Request,
    resource_type: str,
    resource_id: str,
) -> None:
    """Raise 404 when the target resource is missing or not readable."""
    rt = validate_resource_type(resource_type)
    rid = (resource_id or "").strip()
    if not rid:
        raise HTTPException(status_code=422, detail="resource_id is required")

    if rt == COMMENT_RT_ARTICLE:
        await load_article_scoped(db, request, rid, PERM_READ)
        return
    if rt == COMMENT_RT_DOCUMENT:
        await load_document_scoped(db, request, rid, PERM_READ)
        return
    if rt == COMMENT_RT_KNOWLEDGE_BASE:
        await load_knowledge_base_scoped(db, request, rid, PERM_READ)
        return
    if rt == COMMENT_RT_WIKI_SPACE:
        await load_wiki_space_scoped(db, request, rid, PERM_READ)
        return
    if rt == COMMENT_RT_PROJECT:
        if not await is_feature_enabled(db, "agents"):
            raise HTTPException(status_code=404, detail="Project not found")
        sub = get_jwt_sub(request)
        project = await db.get(Project, rid)
        if not project or project.user_sub != sub:
            raise HTTPException(status_code=404, detail="Project not found")
        return

    raise HTTPException(status_code=422, detail=f"Unsupported resource_type: {resource_type}")
