"""Evaluation list/read helpers."""

from __future__ import annotations

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.evaluation import Evaluation, EvaluationItem
from app.models.knowledge_base import KnowledgeBase
from app.models.wiki_models import WikiSpace
from app.schemas.evaluation import EvaluationListResponse, EvaluationResponse
from app.services.resource_acl_constants import RT_EVALUATION
from app.services.resource_list_acl import readable_id_filter


def evaluation_to_response(
    ev: Evaluation,
    kb_name: str | None,
    wiki_name: str | None,
    item_count: int,
) -> EvaluationResponse:
    return EvaluationResponse(
        id=ev.id,
        name=ev.name,
        knowledge_base_id=ev.knowledge_base_id,
        knowledge_base_name=kb_name,
        wiki_space_id=ev.wiki_space_id,
        wiki_space_name=wiki_name,
        description=ev.description,
        item_count=item_count,
        created_at=ev.created_at,
        updated_at=ev.updated_at,
    )


async def item_counts_batch(db: AsyncSession, evaluation_ids: list[str]) -> dict[str, int]:
    if not evaluation_ids:
        return {}
    rows = await db.execute(
        select(EvaluationItem.evaluation_id, func.count())
        .where(EvaluationItem.evaluation_id.in_(evaluation_ids))
        .group_by(EvaluationItem.evaluation_id)
    )
    return {str(eid): int(count) for eid, count in rows.all()}


async def item_count(db: AsyncSession, evaluation_id: str) -> int:
    counts = await item_counts_batch(db, [evaluation_id])
    return counts.get(evaluation_id, 0)


async def list_evaluations_page(
    db: AsyncSession,
    request: Request,
    *,
    knowledge_base_id: str | None,
    limit: int,
    offset: int,
) -> EvaluationListResponse:
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub")
    acl_filters, empty = await readable_id_filter(
        db, payload, sub if isinstance(sub, str) else None, RT_EVALUATION, Evaluation.id
    )
    if empty:
        return EvaluationListResponse(items=[], total=0, limit=limit, offset=offset)

    filters = list(acl_filters)
    if knowledge_base_id:
        filters.append(Evaluation.knowledge_base_id == knowledge_base_id)

    count_q = select(func.count()).select_from(Evaluation)
    if filters:
        count_q = count_q.where(*filters)
    total = int((await db.execute(count_q)).scalar_one())

    q = select(Evaluation).order_by(Evaluation.created_at.desc())
    if filters:
        q = q.where(*filters)
    q = q.offset(offset).limit(limit)
    rows = list((await db.execute(q)).scalars().all())

    kb_ids = {ev.knowledge_base_id for ev in rows}
    wiki_ids = {ev.wiki_space_id for ev in rows if ev.wiki_space_id}
    kb_names: dict[str, str] = {}
    if kb_ids:
        kb_rows = await db.execute(select(KnowledgeBase.id, KnowledgeBase.name).where(KnowledgeBase.id.in_(kb_ids)))
        kb_names = {str(kid): name for kid, name in kb_rows.all()}
    wiki_names: dict[str, str] = {}
    if wiki_ids:
        wiki_rows = await db.execute(select(WikiSpace.id, WikiSpace.name).where(WikiSpace.id.in_(wiki_ids)))
        wiki_names = {str(wid): name for wid, name in wiki_rows.all()}
    item_counts = await item_counts_batch(db, [ev.id for ev in rows])

    items = [
        evaluation_to_response(
            ev,
            kb_names.get(ev.knowledge_base_id),
            wiki_names.get(ev.wiki_space_id) if ev.wiki_space_id else None,
            item_counts.get(ev.id, 0),
        )
        for ev in rows
    ]
    return EvaluationListResponse(items=items, total=total, limit=limit, offset=offset)
