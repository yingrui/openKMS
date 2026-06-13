"""Knowledge base list/read helpers."""

from __future__ import annotations

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import Chunk
from app.models.faq import FAQ
from app.models.kb_document import KBDocument
from app.models.kb_wiki_space import KBWikiSpace
from app.models.knowledge_base import KnowledgeBase
from app.schemas.knowledge_base import KnowledgeBaseListResponse, KnowledgeBaseResponse
from app.services.resource_acl_constants import RT_KNOWLEDGE_BASE
from app.services.resource_list_acl import readable_id_filter


async def kb_stats_batch(db: AsyncSession, kb_ids: list[str]) -> dict[str, dict[str, int]]:
    if not kb_ids:
        return {}
    stats: dict[str, dict[str, int]] = {
        kb_id: {"document_count": 0, "wiki_space_count": 0, "faq_count": 0, "chunk_count": 0}
        for kb_id in kb_ids
    }
    for table, field, key in (
        (KBDocument, KBDocument.knowledge_base_id, "document_count"),
        (KBWikiSpace, KBWikiSpace.knowledge_base_id, "wiki_space_count"),
        (FAQ, FAQ.knowledge_base_id, "faq_count"),
        (Chunk, Chunk.knowledge_base_id, "chunk_count"),
    ):
        rows = await db.execute(
            select(field, func.count())
            .select_from(table)
            .where(field.in_(kb_ids))
            .group_by(field)
        )
        for kb_id, count in rows.all():
            stats[str(kb_id)][key] = int(count)
    return stats


async def kb_stats(db: AsyncSession, kb_id: str) -> dict[str, int]:
    batch = await kb_stats_batch(db, [kb_id])
    return batch.get(
        kb_id,
        {"document_count": 0, "wiki_space_count": 0, "faq_count": 0, "chunk_count": 0},
    )


def kb_to_response(kb: KnowledgeBase, stats: dict[str, int]) -> KnowledgeBaseResponse:
    return KnowledgeBaseResponse(
        id=kb.id,
        name=kb.name,
        description=kb.description,
        embedding_model_id=kb.embedding_model_id,
        judge_model_id=kb.judge_model_id,
        agent_url=kb.agent_url,
        chunk_config=kb.chunk_config,
        faq_prompt=kb.faq_prompt,
        metadata_keys=kb.metadata_keys,
        created_at=kb.created_at,
        updated_at=kb.updated_at,
        **stats,
    )


async def list_knowledge_bases_page(
    db: AsyncSession,
    request: Request,
    *,
    limit: int,
    offset: int,
) -> KnowledgeBaseListResponse:
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub")
    acl_filters, empty = await readable_id_filter(db, payload, sub if isinstance(sub, str) else None, RT_KNOWLEDGE_BASE, KnowledgeBase.id)
    if empty:
        return KnowledgeBaseListResponse(items=[], total=0, limit=limit, offset=offset)

    count_q = select(func.count()).select_from(KnowledgeBase)
    if acl_filters:
        count_q = count_q.where(*acl_filters)
    total = int((await db.execute(count_q)).scalar_one())

    q = select(KnowledgeBase).order_by(KnowledgeBase.created_at.desc())
    if acl_filters:
        q = q.where(*acl_filters)
    q = q.offset(offset).limit(limit)
    kbs = list((await db.execute(q)).scalars().all())

    stats_by_id = await kb_stats_batch(db, [kb.id for kb in kbs])
    items = [
        kb_to_response(
            kb,
            stats_by_id.get(
                kb.id,
                {"document_count": 0, "wiki_space_count": 0, "faq_count": 0, "chunk_count": 0},
            ),
        )
        for kb in kbs
    ]
    return KnowledgeBaseListResponse(items=items, total=total, limit=limit, offset=offset)
