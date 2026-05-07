"""Unified metadata search across documents, articles, wiki spaces, and knowledge bases."""

from __future__ import annotations

import asyncio
from datetime import datetime

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.article_channel import ArticleChannel
from app.models.document import Document
from app.models.document_channel import DocumentChannel
from app.models.knowledge_base import KnowledgeBase
from app.models.wiki_models import WikiSpace
from app.schemas.global_search import GlobalSearchHit, GlobalSearchResponse, GlobalSearchSection
from app.services.article_scope import scoped_article_predicate
from app.services.article_service import collect_channel_and_descendants
from app.services.data_resource_policy import knowledge_base_visible, scoped_document_predicate
from app.services.data_scope import effective_wiki_space_ids, scope_applies


def _collect_document_channel_descendants(channels: list[DocumentChannel], channel_id: str, out: set[str]) -> None:
    out.add(channel_id)
    for c in channels:
        if c.parent_id == channel_id:
            _collect_document_channel_descendants(channels, c.id, out)


def parse_types_param(raw: str | None) -> set[str]:
    """Return requested entity kinds: documents, articles, wiki_spaces, knowledge_bases."""
    s = (raw or "all").strip().lower()
    all_kinds = frozenset({"documents", "articles", "wiki_spaces", "knowledge_bases"})
    if s == "all":
        return set(all_kinds)
    parts = [p.strip().lower() for p in s.split(",") if p.strip()]
    out: set[str] = set()
    for p in parts:
        if p not in all_kinds:
            continue
        out.add(p)
    return out if out else set(all_kinds)


def allowed_types_from_permissions(perms: frozenset[str]) -> set[str]:
    from app.services.permission_catalog import (
        PERM_ALL,
        PERM_ARTICLES_READ,
        PERM_DOCUMENTS_READ,
        PERM_KB_READ,
        PERM_WIKIS_READ,
    )

    if PERM_ALL in perms:
        return {"documents", "articles", "wiki_spaces", "knowledge_bases"}
    out: set[str] = set()
    if PERM_DOCUMENTS_READ in perms:
        out.add("documents")
    if PERM_ARTICLES_READ in perms:
        out.add("articles")
    if PERM_WIKIS_READ in perms:
        out.add("wiki_spaces")
    if PERM_KB_READ in perms:
        out.add("knowledge_bases")
    return out


def _apply_text_filter(q: str | None, name_col, base_query):
    if q and q.strip():
        return base_query.where(name_col.ilike(f"%{q.strip()}%"))
    return base_query


def _apply_updated_range(base_query, col, updated_after: datetime | None, updated_before: datetime | None):
    if updated_after is not None:
        base_query = base_query.where(col >= updated_after)
    if updated_before is not None:
        base_query = base_query.where(col <= updated_before)
    return base_query


async def search_documents_section(
    db: AsyncSession,
    *,
    jwt_payload: dict,
    sub: str | None,
    q: str | None,
    document_channel_id: str | None,
    updated_after: datetime | None,
    updated_before: datetime | None,
    limit: int,
) -> tuple[list[GlobalSearchHit], int]:
    base = (
        select(Document, DocumentChannel.name.label("channel_name"))
        .join(DocumentChannel, Document.channel_id == DocumentChannel.id)
    )
    scope_pred = await scoped_document_predicate(db, jwt_payload, sub) if isinstance(sub, str) else None

    if document_channel_id:
        ch_result = await db.execute(select(DocumentChannel).order_by(DocumentChannel.sort_order))
        all_channels = list(ch_result.scalars().all())
        target = next((c for c in all_channels if c.id == document_channel_id), None)
        if not target:
            raise ValueError("document_channel_not_found")
        ids_to_include: set[str] = set()
        _collect_document_channel_descendants(all_channels, document_channel_id, ids_to_include)
        if not ids_to_include:
            return [], 0
        if scope_pred is not None:
            base = base.where(and_(Document.channel_id.in_(ids_to_include), scope_pred))
        else:
            base = base.where(Document.channel_id.in_(ids_to_include))
    elif scope_pred is not None:
        base = base.where(scope_pred)

    base = _apply_text_filter(q, Document.name, base)
    base = _apply_updated_range(base, Document.updated_at, updated_after, updated_before)

    count_q = select(func.count()).select_from(base.subquery())
    total = int((await db.execute(count_q)).scalar_one() or 0)

    rows_q = base.order_by(Document.updated_at.desc()).limit(limit)
    result = await db.execute(rows_q)
    rows = result.all()
    items: list[GlobalSearchHit] = []
    for d, ch_name in rows:
        items.append(
            GlobalSearchHit(
                id=d.id,
                name=d.name,
                title=None,
                kind="document",
                url_path=f"/documents/view/{d.id}",
                channel_id=d.channel_id,
                channel_name=ch_name,
                updated_at=d.updated_at,
            )
        )
    return items, total


async def search_articles_section(
    db: AsyncSession,
    *,
    jwt_payload: dict,
    sub: str | None,
    q: str | None,
    article_channel_id: str | None,
    updated_after: datetime | None,
    updated_before: datetime | None,
    limit: int,
) -> tuple[list[GlobalSearchHit], int]:
    base = select(Article, ArticleChannel.name.label("channel_name")).join(
        ArticleChannel, Article.channel_id == ArticleChannel.id
    )
    scope_pred = await scoped_article_predicate(db, jwt_payload, sub) if isinstance(sub, str) else None

    if article_channel_id:
        ch_result = await db.execute(select(ArticleChannel).order_by(ArticleChannel.sort_order))
        all_channels = list(ch_result.scalars().all())
        target = next((c for c in all_channels if c.id == article_channel_id), None)
        if not target:
            raise ValueError("article_channel_not_found")
        ids_to_include: set[str] = set()
        collect_channel_and_descendants(all_channels, article_channel_id, ids_to_include)
        if not ids_to_include:
            return [], 0
        if scope_pred is not None:
            base = base.where(and_(Article.channel_id.in_(ids_to_include), scope_pred))
        else:
            base = base.where(Article.channel_id.in_(ids_to_include))
    elif scope_pred is not None:
        base = base.where(scope_pred)

    base = _apply_text_filter(q, Article.name, base)
    base = _apply_updated_range(base, Article.updated_at, updated_after, updated_before)

    count_q = select(func.count()).select_from(base.subquery())
    total = int((await db.execute(count_q)).scalar_one() or 0)

    rows_q = base.order_by(Article.updated_at.desc()).limit(limit)
    result = await db.execute(rows_q)
    rows = result.all()
    items: list[GlobalSearchHit] = []
    for a, ch_name in rows:
        items.append(
            GlobalSearchHit(
                id=a.id,
                name=a.name,
                title=a.name,
                kind="article",
                url_path=f"/articles/view/{a.id}",
                channel_id=a.channel_id,
                channel_name=ch_name,
                updated_at=a.updated_at,
            )
        )
    return items, total


async def search_wiki_spaces_section(
    db: AsyncSession,
    *,
    jwt_payload: dict,
    sub: str | None,
    q: str | None,
    updated_after: datetime | None,
    updated_before: datetime | None,
    limit: int,
) -> tuple[list[GlobalSearchHit], int]:
    base = select(WikiSpace)
    if isinstance(sub, str) and scope_applies(jwt_payload, sub):
        allowed = await effective_wiki_space_ids(db, sub)
        if allowed is not None:
            if not allowed:
                return [], 0
            base = base.where(WikiSpace.id.in_(allowed))

    base = _apply_text_filter(q, WikiSpace.name, base)
    base = _apply_updated_range(base, WikiSpace.updated_at, updated_after, updated_before)

    count_q = select(func.count()).select_from(base.subquery())
    total = int((await db.execute(count_q)).scalar_one() or 0)

    rows_q = base.order_by(WikiSpace.updated_at.desc()).limit(limit)
    result = await db.execute(rows_q)
    spaces = list(result.scalars().all())
    items = [
        GlobalSearchHit(
            id=s.id,
            name=s.name,
            title=None,
            kind="wiki_space",
            url_path=f"/wikis/{s.id}",
            channel_id=None,
            channel_name=None,
            updated_at=s.updated_at,
        )
        for s in spaces
    ]
    return items, total


async def search_knowledge_bases_section(
    db: AsyncSession,
    *,
    jwt_payload: dict,
    sub: str | None,
    q: str | None,
    updated_after: datetime | None,
    updated_before: datetime | None,
    limit: int,
) -> tuple[list[GlobalSearchHit], int]:
    base = select(KnowledgeBase).order_by(KnowledgeBase.updated_at.desc())
    base = _apply_text_filter(q, KnowledgeBase.name, base)
    base = _apply_updated_range(base, KnowledgeBase.updated_at, updated_after, updated_before)

    result = await db.execute(base)
    all_rows = list(result.scalars().all())
    filtered: list[KnowledgeBase] = []
    if isinstance(sub, str):
        for kb in all_rows:
            if await knowledge_base_visible(db, jwt_payload, sub, kb):
                filtered.append(kb)
    else:
        filtered = all_rows

    total = len(filtered)
    limited = filtered[:limit]
    items = [
        GlobalSearchHit(
            id=kb.id,
            name=kb.name,
            title=None,
            kind="knowledge_base",
            url_path=f"/knowledge-bases/{kb.id}",
            channel_id=None,
            channel_name=None,
            updated_at=kb.updated_at,
        )
        for kb in limited
    ]
    return items, total


async def run_global_search(
    db: AsyncSession,
    *,
    jwt_payload: dict,
    sub: str | None,
    perms: frozenset[str],
    types_param: str | None,
    q: str | None,
    document_channel_id: str | None,
    article_channel_id: str | None,
    updated_after: datetime | None,
    updated_before: datetime | None,
    limit: int,
) -> tuple[GlobalSearchResponse, None] | tuple[None, str]:
    """Returns (response, None) or (None, error_code) for channel not found."""

    requested = parse_types_param(types_param)
    allowed = allowed_types_from_permissions(perms)
    to_run = requested & allowed

    if not to_run:
        return None, "forbidden"

    docs_section: GlobalSearchSection | None = None
    arts_section: GlobalSearchSection | None = None
    wiki_section: GlobalSearchSection | None = None
    kb_section: GlobalSearchSection | None = None

    async def run_docs():
        nonlocal docs_section
        if "documents" not in to_run:
            docs_section = GlobalSearchSection(items=[], total=0)
            return
        items, total = await search_documents_section(
            db,
            jwt_payload=jwt_payload,
            sub=sub,
            q=q,
            document_channel_id=document_channel_id,
            updated_after=updated_after,
            updated_before=updated_before,
            limit=limit,
        )
        docs_section = GlobalSearchSection(items=items, total=total)

    async def run_arts():
        nonlocal arts_section
        if "articles" not in to_run:
            arts_section = GlobalSearchSection(items=[], total=0)
            return
        items, total = await search_articles_section(
            db,
            jwt_payload=jwt_payload,
            sub=sub,
            q=q,
            article_channel_id=article_channel_id,
            updated_after=updated_after,
            updated_before=updated_before,
            limit=limit,
        )
        arts_section = GlobalSearchSection(items=items, total=total)

    async def run_wiki():
        nonlocal wiki_section
        if "wiki_spaces" not in to_run:
            wiki_section = GlobalSearchSection(items=[], total=0)
            return
        items, total = await search_wiki_spaces_section(
            db,
            jwt_payload=jwt_payload,
            sub=sub,
            q=q,
            updated_after=updated_after,
            updated_before=updated_before,
            limit=limit,
        )
        wiki_section = GlobalSearchSection(items=items, total=total)

    async def run_kb():
        nonlocal kb_section
        if "knowledge_bases" not in to_run:
            kb_section = GlobalSearchSection(items=[], total=0)
            return
        items, total = await search_knowledge_bases_section(
            db,
            jwt_payload=jwt_payload,
            sub=sub,
            q=q,
            updated_after=updated_after,
            updated_before=updated_before,
            limit=limit,
        )
        kb_section = GlobalSearchSection(items=items, total=total)

    try:
        await asyncio.gather(run_docs(), run_arts(), run_wiki(), run_kb())
    except ValueError as e:
        if str(e) == "document_channel_not_found":
            return None, "document_channel_not_found"
        if str(e) == "article_channel_not_found":
            return None, "article_channel_not_found"
        raise

    assert docs_section is not None and arts_section is not None
    assert wiki_section is not None and kb_section is not None

    # Types not requested: empty sections without querying (already zeros from to_run logic)
    # Types requested but not permitted: show empty
    def section_for(kind: str) -> GlobalSearchSection:
        if kind not in requested:
            return GlobalSearchSection(items=[], total=0)
        if kind not in allowed:
            return GlobalSearchSection(items=[], total=0)
        if kind == "documents":
            return docs_section
        if kind == "articles":
            return arts_section
        if kind == "wiki_spaces":
            return wiki_section
        return kb_section

    resp = GlobalSearchResponse(
        query=(q or "").strip(),
        types_requested=sorted(requested),
        documents=section_for("documents"),
        articles=section_for("articles"),
        wiki_spaces=section_for("wiki_spaces"),
        knowledge_bases=section_for("knowledge_bases"),
    )
    return resp, None
