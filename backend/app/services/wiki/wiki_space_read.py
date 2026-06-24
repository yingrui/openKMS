"""Wiki space list/read helpers."""

from __future__ import annotations

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wiki_models import WikiPage, WikiSpace
from app.schemas.wiki import WikiSpaceListResponse, WikiSpaceResponse
from app.services.acl.data_scope import effective_wiki_space_ids, scope_applies


async def wiki_page_counts_batch(db: AsyncSession, space_ids: list[str]) -> dict[str, int]:
    if not space_ids:
        return {}

    rows = await db.execute(
        select(WikiPage.wiki_space_id, func.count())
        .where(WikiPage.wiki_space_id.in_(space_ids))
        .group_by(WikiPage.wiki_space_id)
    )
    return {str(sid): int(count) for sid, count in rows.all()}


def wiki_space_to_response(ws: WikiSpace, page_count: int) -> WikiSpaceResponse:
    return WikiSpaceResponse(
        id=ws.id,
        name=ws.name,
        description=ws.description,
        semantic_similarity_threshold=float(ws.semantic_similarity_threshold),
        semantic_match_top_k=int(ws.semantic_match_top_k),
        semantic_embedding_model_id=ws.semantic_embedding_model_id,
        last_semantic_index_at=ws.last_semantic_index_at,
        created_at=ws.created_at,
        updated_at=ws.updated_at,
        page_count=page_count,
    )


async def list_wiki_spaces_page(
    db: AsyncSession,
    request: Request,
    *,
    limit: int,
    offset: int,
) -> WikiSpaceListResponse:
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub")

    acl_filters = []
    if isinstance(sub, str) and scope_applies(payload, sub):
        allowed = await effective_wiki_space_ids(db, sub, payload)
        if allowed is not None:
            if not allowed:
                return WikiSpaceListResponse(items=[], total=0, limit=limit, offset=offset)
            acl_filters.append(WikiSpace.id.in_(allowed))

    count_q = select(func.count()).select_from(WikiSpace)
    if acl_filters:
        count_q = count_q.where(*acl_filters)
    total = int((await db.execute(count_q)).scalar_one())

    q = select(WikiSpace).order_by(WikiSpace.created_at.desc())
    if acl_filters:
        q = q.where(*acl_filters)
    spaces = list((await db.execute(q.offset(offset).limit(limit))).scalars().all())

    page_counts = await wiki_page_counts_batch(db, [s.id for s in spaces])
    items = [wiki_space_to_response(s, page_counts.get(s.id, 0)) for s in spaces]
    return WikiSpaceListResponse(items=items, total=total, limit=limit, offset=offset)
