"""Persisted QA-style threads scoped to an evaluation (``surface=evaluation``; same qa-agent proxy as KB Q&A)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.api.evaluations import get_evaluation_scoped
from app.api.kb_agent_conversations import (
    KbAgentConversationCreate,
    KbAgentConversationPatch,
    KbAgentMessageCreate,
    _conv_to_out,
    _get_sub,
    _history_before_new_user,
    _msg_to_out,
    _ndjson_kb_qa_stream_persist,
    _run_kb_ask_non_stream,
    _sources_to_json,
    _tail_rows_for_kb_agent_context,
)
from app.database import get_db
from app.models.agent_models import AgentConversation, AgentMessage
from app.models.evaluation import Evaluation
from app.models.knowledge_base import KnowledgeBase
from app.schemas.agent import AgentConversationResponse, AgentMessageListResponse, AgentMessagePostResponse
from app.services.agent.wiki_runner import new_id
from app.services.data_resource_policy import knowledge_base_visible

router = APIRouter(tags=["evaluations"])

EVAL_AUTH = [Depends(require_auth)]


async def _kb_for_evaluation(request: Request, db: AsyncSession, ev: Evaluation) -> KnowledgeBase:
    kb = await db.get(KnowledgeBase, ev.knowledge_base_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and not await knowledge_base_visible(db, p, sub, kb):
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return kb


async def _get_eval_conversation(
    db: AsyncSession, conversation_id: str, sub: str, evaluation_id: str
) -> AgentConversation:
    c = await db.get(AgentConversation, conversation_id)
    if not c or c.user_sub != sub:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if c.surface != "evaluation":
        raise HTTPException(status_code=404, detail="Conversation not found")
    ctx = (c.context or {}).get("evaluation_id")
    if ctx != evaluation_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return c


@router.get(
    "/{evaluation_id}/agent-conversations",
    response_model=list[AgentConversationResponse],
    dependencies=EVAL_AUTH,
)
async def list_eval_agent_conversations(
    evaluation_id: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=100),
    ev: Evaluation = Depends(get_evaluation_scoped),
    db: AsyncSession = Depends(get_db),
):
    _ = ev
    sub = _get_sub(request)
    r = await db.execute(
        select(AgentConversation)
        .where(
            AgentConversation.user_sub == sub,
            AgentConversation.surface == "evaluation",
            AgentConversation.context.contains({"evaluation_id": evaluation_id}),
        )
        .order_by(AgentConversation.updated_at.desc())
        .limit(limit)
    )
    return [_conv_to_out(c) for c in r.scalars().all()]


@router.post(
    "/{evaluation_id}/agent-conversations",
    response_model=AgentConversationResponse,
    status_code=201,
    dependencies=EVAL_AUTH,
)
async def create_eval_agent_conversation(
    evaluation_id: str,
    request: Request,
    body: KbAgentConversationCreate,
    ev: Evaluation = Depends(get_evaluation_scoped),
    db: AsyncSession = Depends(get_db),
):
    _ = ev
    sub = _get_sub(request)
    kb = await _kb_for_evaluation(request, db, ev)
    if not kb.agent_url:
        raise HTTPException(
            status_code=400,
            detail="Configure a QA agent URL on the evaluation's knowledge base to use assistant chat.",
        )
    c = AgentConversation(
        id=str(uuid.uuid4()),
        user_sub=sub,
        surface="evaluation",
        context={"evaluation_id": evaluation_id, "knowledge_base_id": ev.knowledge_base_id},
        title=body.title,
    )
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return _conv_to_out(c)


@router.delete(
    "/{evaluation_id}/agent-conversations/{conversation_id}",
    status_code=204,
    dependencies=EVAL_AUTH,
)
async def delete_eval_agent_conversation(
    evaluation_id: str,
    conversation_id: str,
    request: Request,
    ev: Evaluation = Depends(get_evaluation_scoped),
    db: AsyncSession = Depends(get_db),
):
    _ = ev
    c = await _get_eval_conversation(db, conversation_id, _get_sub(request), evaluation_id)
    await db.delete(c)
    await db.flush()


@router.patch(
    "/{evaluation_id}/agent-conversations/{conversation_id}",
    response_model=AgentConversationResponse,
    dependencies=EVAL_AUTH,
)
async def patch_eval_agent_conversation(
    evaluation_id: str,
    conversation_id: str,
    request: Request,
    body: KbAgentConversationPatch,
    ev: Evaluation = Depends(get_evaluation_scoped),
    db: AsyncSession = Depends(get_db),
):
    _ = ev
    c = await _get_eval_conversation(db, conversation_id, _get_sub(request), evaluation_id)
    if body.title is not None:
        c.title = body.title
    await db.flush()
    await db.refresh(c)
    return _conv_to_out(c)


@router.get(
    "/{evaluation_id}/agent-conversations/{conversation_id}/messages",
    response_model=AgentMessageListResponse,
    dependencies=EVAL_AUTH,
)
async def list_eval_agent_messages(
    evaluation_id: str,
    conversation_id: str,
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    ev: Evaluation = Depends(get_evaluation_scoped),
    db: AsyncSession = Depends(get_db),
):
    _ = ev
    await _get_eval_conversation(db, conversation_id, _get_sub(request), evaluation_id)
    total = (
        await db.execute(
            select(func.count()).select_from(AgentMessage).where(AgentMessage.conversation_id == conversation_id)
        )
    ).scalar_one()
    total_i = int(total or 0)
    r = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conversation_id)
        .order_by(AgentMessage.created_at, AgentMessage.id)
        .offset(offset)
        .limit(limit)
    )
    rows = list(r.scalars().all())
    return AgentMessageListResponse(
        items=[_msg_to_out(m) for m in rows],
        total=total_i,
        limit=limit,
        offset=offset,
    )


@router.delete(
    "/{evaluation_id}/agent-conversations/{conversation_id}/messages/from/{message_id}",
    dependencies=EVAL_AUTH,
)
async def delete_eval_agent_messages_from(
    evaluation_id: str,
    conversation_id: str,
    message_id: str,
    request: Request,
    ev: Evaluation = Depends(get_evaluation_scoped),
    db: AsyncSession = Depends(get_db),
):
    from app.api.agent import _bump_conversation_timestamp

    _ = ev
    c = await _get_eval_conversation(db, conversation_id, _get_sub(request), evaluation_id)
    r = await db.execute(
        select(AgentMessage.id)
        .where(AgentMessage.conversation_id == conversation_id)
        .order_by(AgentMessage.created_at, AgentMessage.id)
    )
    ordered_ids = [row[0] for row in r.all()]
    if message_id not in ordered_ids:
        raise HTTPException(status_code=404, detail="Message not found in this conversation")
    from_idx = ordered_ids.index(message_id)
    to_delete = ordered_ids[from_idx:]
    res = await db.execute(delete(AgentMessage).where(AgentMessage.id.in_(to_delete)))
    n = int(res.rowcount or 0)
    if n:
        _bump_conversation_timestamp(c)
    await db.flush()
    return {"deleted": n}


@router.post(
    "/{evaluation_id}/agent-conversations/{conversation_id}/messages",
    dependencies=EVAL_AUTH,
)
async def post_eval_agent_message(
    evaluation_id: str,
    conversation_id: str,
    request: Request,
    body: KbAgentMessageCreate,
    token: str = Depends(require_auth),
    ev: Evaluation = Depends(get_evaluation_scoped),
    db: AsyncSession = Depends(get_db),
):
    from app.api.agent import _bump_conversation_timestamp, _maybe_set_conversation_title_from_first_user_message
    from app.api.kb_agent_conversations import KB_QA_SOURCES_KEY

    _ = ev
    kb = await _kb_for_evaluation(request, db, ev)
    kb_id = ev.knowledge_base_id
    if not kb.agent_url:
        raise HTTPException(status_code=400, detail="No agent URL configured for this knowledge base")

    c = await _get_eval_conversation(db, conversation_id, _get_sub(request), evaluation_id)

    r = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == c.id)
        .order_by(AgentMessage.created_at)
    )
    prior_rows = list(r.scalars().all())
    prior_for_context = _tail_rows_for_kb_agent_context(prior_rows)

    user_m = AgentMessage(
        id=new_id(),
        conversation_id=c.id,
        role="user",
        content=body.content,
    )
    db.add(user_m)
    await db.flush()
    await db.refresh(user_m)

    all_rows = prior_for_context + [user_m]
    history = _history_before_new_user(all_rows)
    question = body.content

    await _maybe_set_conversation_title_from_first_user_message(db, c, body.content)
    _bump_conversation_timestamp(c)
    await db.flush()

    if body.stream:
        return StreamingResponse(
            _ndjson_kb_qa_stream_persist(
                db,
                kb,
                kb_id,
                c,
                user_m,
                token,
                body.session_id,
                question,
                history,
            ),
            media_type="application/x-ndjson",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    answer, sources = await _run_kb_ask_non_stream(kb, kb_id, question, history, token, body.session_id)
    tool_payload: dict[str, Any] = {}
    if sources:
        tool_payload[KB_QA_SOURCES_KEY] = _sources_to_json(sources)
    asst_m = AgentMessage(
        id=new_id(),
        conversation_id=c.id,
        role="assistant",
        content=answer,
        tool_calls=tool_payload or None,
    )
    db.add(asst_m)
    _bump_conversation_timestamp(c)
    await db.flush()
    await db.refresh(asst_m)
    return AgentMessagePostResponse(message=_msg_to_out(user_m), assistant=_msg_to_out(asst_m))
