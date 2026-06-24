"""Latest comments on resources the signed-in user owns (ACL owner or creator)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.article_channel import ArticleChannel
from app.models.content_comment import ContentComment
from app.models.document import Document
from app.models.document_channel import DocumentChannel
from app.models.knowledge_base import KnowledgeBase
from app.models.project import Project
from app.models.wiki_models import WikiSpace
from app.services.acl.acl_context import _acl_entries_for_resources, resource_context_chain
from app.services.acl.acl_identity import user_grant_matches
from app.services.comments.comment_resource_types import (
    COMMENT_RT_ARTICLE,
    COMMENT_RT_DOCUMENT,
    COMMENT_RT_KNOWLEDGE_BASE,
    COMMENT_RT_PROJECT,
    COMMENT_RT_WIKI_SPACE,
)
from app.services.feature_toggles import is_feature_enabled
from app.services.acl.resource_acl_constants import (
    GRANTEE_USER,
    RT_ARTICLE_CHANNEL,
    RT_DOCUMENT_CHANNEL,
    RT_KNOWLEDGE_BASE,
    RT_WIKI_SPACE,
)

_BODY_PREVIEW_LEN = 240


@dataclass(frozen=True)
class OwnedCommentFeedItem:
    id: str
    resource_type: str
    resource_id: str
    resource_title: str
    parent_comment_id: str | None
    body: str
    rank: int | None
    created_by: str
    created_by_name: str | None
    created_at: datetime
    is_reply: bool


def preview_comment_body(body: str, *, max_len: int = _BODY_PREVIEW_LEN) -> str:
    text = (body or "").strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


async def _subject_owns_resource(
    db: AsyncSession,
    subject: str,
    payload: dict | None,
    resource_type: str,
    resource_id: str,
    model,
) -> bool:
    """True when subject is the Sharing UI owner (nearest user grant in ACL chain, else creator)."""
    chain = await resource_context_chain(db, resource_type, resource_id)
    entries = await _acl_entries_for_resources(db, chain)
    for rt, rid in chain:
        user_entries = [
            e
            for e in entries
            if e.resource_type == rt and e.resource_id == rid and e.grantee_type == GRANTEE_USER
        ]
        if user_entries:
            return await user_grant_matches(db, user_entries[0].grantee_id, subject, payload)
    row = await db.get(model, resource_id)
    if row is not None and getattr(row, "created_by", None):
        return await user_grant_matches(db, row.created_by, subject, payload)
    return False


async def _owned_container_ids(
    db: AsyncSession,
    subject: str,
    payload: dict | None,
    resource_type: str,
    model,
) -> set[str]:
    if not subject:
        return set()
    result = await db.execute(select(model.id))
    owned: set[str] = set()
    for (rid,) in result.all():
        rid_str = str(rid)
        if await _subject_owns_resource(db, subject, payload, resource_type, rid_str, model):
            owned.add(rid_str)
    return owned


async def _owned_resource_id_sets(
    db: AsyncSession, subject: str, payload: dict | None
) -> dict[str, set[str]]:
    project_ids: set[str] = set()
    if await is_feature_enabled(db, "agents"):
        proj_result = await db.execute(select(Project.id, Project.user_sub))
        for pid, user_sub in proj_result.all():
            if await user_grant_matches(db, user_sub, subject, payload):
                project_ids.add(str(pid))

    return {
        COMMENT_RT_KNOWLEDGE_BASE: await _owned_container_ids(
            db, subject, payload, RT_KNOWLEDGE_BASE, KnowledgeBase
        ),
        COMMENT_RT_WIKI_SPACE: await _owned_container_ids(
            db, subject, payload, RT_WIKI_SPACE, WikiSpace
        ),
        RT_DOCUMENT_CHANNEL: await _owned_container_ids(
            db, subject, payload, RT_DOCUMENT_CHANNEL, DocumentChannel
        ),
        RT_ARTICLE_CHANNEL: await _owned_container_ids(
            db, subject, payload, RT_ARTICLE_CHANNEL, ArticleChannel
        ),
        COMMENT_RT_PROJECT: project_ids,
    }


async def load_recent_comments_on_owned_resources(
    db: AsyncSession,
    subject: str,
    *,
    payload: dict | None = None,
    limit: int = 5,
) -> list[OwnedCommentFeedItem]:
    if not subject:
        return []

    owned = await _owned_resource_id_sets(db, subject, payload)
    conditions = []

    kb_ids = owned[COMMENT_RT_KNOWLEDGE_BASE]
    if kb_ids:
        conditions.append(
            and_(
                ContentComment.resource_type == COMMENT_RT_KNOWLEDGE_BASE,
                ContentComment.resource_id.in_(kb_ids),
            )
        )

    wiki_ids = owned[COMMENT_RT_WIKI_SPACE]
    if wiki_ids:
        conditions.append(
            and_(
                ContentComment.resource_type == COMMENT_RT_WIKI_SPACE,
                ContentComment.resource_id.in_(wiki_ids),
            )
        )

    project_ids = owned[COMMENT_RT_PROJECT]
    if project_ids:
        conditions.append(
            and_(
                ContentComment.resource_type == COMMENT_RT_PROJECT,
                ContentComment.resource_id.in_(project_ids),
            )
        )

    doc_channel_ids = owned[RT_DOCUMENT_CHANNEL]
    if doc_channel_ids:
        doc_subq = select(Document.id).where(Document.channel_id.in_(doc_channel_ids))
        conditions.append(
            and_(
                ContentComment.resource_type == COMMENT_RT_DOCUMENT,
                ContentComment.resource_id.in_(doc_subq),
            )
        )

    art_channel_ids = owned[RT_ARTICLE_CHANNEL]
    if art_channel_ids:
        art_subq = select(Article.id).where(Article.channel_id.in_(art_channel_ids))
        conditions.append(
            and_(
                ContentComment.resource_type == COMMENT_RT_ARTICLE,
                ContentComment.resource_id.in_(art_subq),
            )
        )

    if not conditions:
        return []

    rows_result = await db.execute(
        select(ContentComment)
        .where(or_(*conditions))
        .order_by(ContentComment.created_at.desc())
        .limit(limit)
    )
    rows = list(rows_result.scalars().all())
    if not rows:
        return []

    titles = await _resolve_resource_titles(db, rows)
    items: list[OwnedCommentFeedItem] = []
    for row in rows:
        key = f"{row.resource_type}:{row.resource_id}"
        items.append(
            OwnedCommentFeedItem(
                id=row.id,
                resource_type=row.resource_type,
                resource_id=row.resource_id,
                resource_title=titles.get(key, row.resource_id),
                parent_comment_id=row.parent_comment_id,
                body=preview_comment_body(row.body),
                rank=row.rank,
                created_by=row.created_by,
                created_by_name=row.created_by_name,
                created_at=row.created_at,
                is_reply=row.parent_comment_id is not None,
            )
        )
    return items


async def _resolve_resource_titles(db: AsyncSession, rows: list[ContentComment]) -> dict[str, str]:
    by_type: dict[str, set[str]] = {}
    for row in rows:
        by_type.setdefault(row.resource_type, set()).add(row.resource_id)

    titles: dict[str, str] = {}

    doc_ids = by_type.get(COMMENT_RT_DOCUMENT, set())
    if doc_ids:
        result = await db.execute(select(Document.id, Document.name).where(Document.id.in_(doc_ids)))
        for rid, name in result.all():
            titles[f"{COMMENT_RT_DOCUMENT}:{rid}"] = name

    art_ids = by_type.get(COMMENT_RT_ARTICLE, set())
    if art_ids:
        result = await db.execute(select(Article.id, Article.name).where(Article.id.in_(art_ids)))
        for rid, name in result.all():
            titles[f"{COMMENT_RT_ARTICLE}:{rid}"] = name

    kb_ids = by_type.get(COMMENT_RT_KNOWLEDGE_BASE, set())
    if kb_ids:
        result = await db.execute(select(KnowledgeBase.id, KnowledgeBase.name).where(KnowledgeBase.id.in_(kb_ids)))
        for rid, name in result.all():
            titles[f"{COMMENT_RT_KNOWLEDGE_BASE}:{rid}"] = name

    wiki_ids = by_type.get(COMMENT_RT_WIKI_SPACE, set())
    if wiki_ids:
        result = await db.execute(select(WikiSpace.id, WikiSpace.name).where(WikiSpace.id.in_(wiki_ids)))
        for rid, name in result.all():
            titles[f"{COMMENT_RT_WIKI_SPACE}:{rid}"] = name

    proj_ids = by_type.get(COMMENT_RT_PROJECT, set())
    if proj_ids:
        result = await db.execute(select(Project.id, Project.name).where(Project.id.in_(proj_ids)))
        for rid, name in result.all():
            titles[f"{COMMENT_RT_PROJECT}:{rid}"] = name

    return titles
