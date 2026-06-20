"""Project agent conversation and message routes."""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.agent import (
    _bump_conversation_timestamp,
    _maybe_set_conversation_title_from_first_user_message,
    _msg_to_out,
)
from app.api.auth import require_permission
from app.api.deps import get_jwt_sub
from app.config import settings
from app.database import get_db
from app.models.agent_models import AgentConversation, AgentMessage
from app.models.project import Project
from app.schemas.agent import AgentConversationResponse, AgentMessageListResponse, AgentMessagePostResponse
from app.schemas.project import ProjectConversationCreate, ProjectConversationPatch, ProjectMessageCreate, ProjectMessageResume
from app.services.agent.llm import resolve_agent_llm_config
from app.services.agent.wiki_runner import WIKI_TOOL_TRANSCRIPTS_KEY
from app.services.conversation_title import suggest_conversation_title
from app.services.agent_session_api_key import ensure_session_api_key, revoke_session_api_key
from app.services.agent_skill_install import ensure_skills_materialized
from app.services.deep_agents.checkpointer import delete_conversation_thread
from app.services.deep_agents.observability import AgentTurnContext
from app.services.deep_agents.runner import iter_project_stream_parts, new_id, resume_project_interrupt, run_project_turn
from app.services.deep_agents.stream_accumulator import ProjectStreamAccumulator
from app.services.permission_catalog import PERM_PROJECTS_READ, PERM_PROJECTS_WRITE

router = APIRouter()


def _ndjson_line(obj: dict) -> bytes:
    return (json.dumps(obj, ensure_ascii=False, default=str) + "\n").encode()


async def _persist_stream_error(
    db: AsyncSession,
    conversation: AgentConversation,
    turn: AgentTurnContext,
    err: str,
    *,
    assistant_id: str | None = None,
    tool_count: int = 0,
    exc: BaseException | None = None,
) -> AgentMessage:
    """Persist failed turn as assistant message and record last_turn metadata."""
    asst = AgentMessage(
        id=assistant_id or new_id(),
        conversation_id=conversation.id,
        role="assistant",
        content=err,
    )
    db.add(asst)
    _bump_conversation_timestamp(conversation)
    if turn._finished:
        turn.apply_last_turn(conversation, status="failed", error=err, tool_count=tool_count)
    else:
        turn.log_failed(
            err,
            exc=exc,
            conversation=conversation,
            tool_count=tool_count,
        )
    await db.flush()
    await db.refresh(asst)
    return asst


def _error_ndjson_line(err: str, asst: AgentMessage) -> bytes:
    return _ndjson_line(
        {
            "type": "error",
            "detail": err,
            "message": _msg_to_out(asst).model_dump(mode="json"),
        }
    )


def _conv_to_out(c: AgentConversation) -> AgentConversationResponse:
    return AgentConversationResponse(
        id=c.id,
        user_sub=c.user_sub,
        surface=c.surface,
        context=c.context,
        title=c.title,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


async def _get_project(db: AsyncSession, project_id: str, sub: str) -> Project:
    p = await db.get(Project, project_id)
    if not p or p.user_sub != sub:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


async def _get_conv(db: AsyncSession, conv_id: str, sub: str, project_id: str) -> AgentConversation:
    c = await db.get(AgentConversation, conv_id, options=[selectinload(AgentConversation.messages)])
    if not c or c.user_sub != sub or c.surface != "project":
        raise HTTPException(status_code=404, detail="Conversation not found")
    if (c.context or {}).get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return c


@router.get(
    "/{project_id}/conversations",
    response_model=list[AgentConversationResponse],
    dependencies=[Depends(require_permission(PERM_PROJECTS_READ))],
)
async def list_conversations(
    project_id: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    sub = get_jwt_sub(request)
    await _get_project(db, project_id, sub)
    r = await db.execute(
        select(AgentConversation)
        .where(
            AgentConversation.user_sub == sub,
            AgentConversation.surface == "project",
            AgentConversation.context.contains({"project_id": project_id}),
        )
        .order_by(AgentConversation.updated_at.desc())
        .limit(limit)
    )
    return [_conv_to_out(c) for c in r.scalars().all()]


@router.post(
    "/{project_id}/conversations",
    response_model=AgentConversationResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def create_conversation(
    project_id: str,
    body: ProjectConversationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = get_jwt_sub(request)
    await _get_project(db, project_id, sub)
    c = AgentConversation(
        id=str(uuid.uuid4()),
        user_sub=sub,
        surface="project",
        context={"project_id": project_id},
        title=body.title,
    )
    db.add(c)
    await db.flush()
    jwt_payload = request.state.openkms_jwt_payload
    await ensure_session_api_key(db, c, jwt_payload)
    await db.refresh(c)
    return _conv_to_out(c)


@router.patch(
    "/{project_id}/conversations/{conversation_id}",
    response_model=AgentConversationResponse,
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def patch_conversation(
    project_id: str,
    conversation_id: str,
    body: ProjectConversationPatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = get_jwt_sub(request)
    c = await _get_conv(db, conversation_id, sub, project_id)
    if body.title is not None:
        c.title = body.title
    await db.flush()
    await db.refresh(c)
    return _conv_to_out(c)


@router.post(
    "/{project_id}/conversations/{conversation_id}/suggest-title",
    response_model=AgentConversationResponse,
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def suggest_conversation_title_route(
    project_id: str,
    conversation_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = get_jwt_sub(request)
    c = await _get_conv(db, conversation_id, sub, project_id)
    model_config = await resolve_agent_llm_config(db, model_id=settings.deep_agent_model_id)
    if not model_config:
        raise HTTPException(
            status_code=503,
            detail="No LLM model configured. Add an LLM in Console > Models.",
        )
    r = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conversation_id)
        .order_by(AgentMessage.created_at.asc(), AgentMessage.id.asc())
    )
    messages = list(r.scalars().all())
    try:
        title = await suggest_conversation_title(messages, model_config)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}") from e
    c.title = title
    _bump_conversation_timestamp(c)
    await db.flush()
    await db.refresh(c)
    return _conv_to_out(c)


@router.delete(
    "/{project_id}/conversations/{conversation_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def delete_conversation(
    project_id: str,
    conversation_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = get_jwt_sub(request)
    c = await _get_conv(db, conversation_id, sub, project_id)
    await revoke_session_api_key(db, c)
    await db.execute(delete(AgentMessage).where(AgentMessage.conversation_id == conversation_id))
    await db.execute(delete(AgentConversation).where(AgentConversation.id == conversation_id))
    await db.flush()


@router.get(
    "/{project_id}/conversations/{conversation_id}/messages",
    response_model=AgentMessageListResponse,
    dependencies=[Depends(require_permission(PERM_PROJECTS_READ))],
)
async def list_messages(
    project_id: str,
    conversation_id: str,
    request: Request,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    sub = get_jwt_sub(request)
    await _get_conv(db, conversation_id, sub, project_id)
    total = (
        await db.execute(
            select(func.count()).select_from(AgentMessage).where(AgentMessage.conversation_id == conversation_id)
        )
    ).scalar_one()
    r = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conversation_id)
        .order_by(AgentMessage.created_at.asc(), AgentMessage.id.asc())
        .offset(offset)
        .limit(limit)
    )
    return AgentMessageListResponse(
        items=[_msg_to_out(m) for m in r.scalars().all()],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.delete(
    "/{project_id}/conversations/{conversation_id}/messages/from/{message_id}",
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def delete_conversation_messages_from(
    project_id: str,
    conversation_id: str,
    message_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    """
    Remove this message and all messages after it in chronological order.
    Clears LangGraph checkpoint state so the next turn matches truncated history.
    """
    sub = get_jwt_sub(request)
    c = await _get_conv(db, conversation_id, sub, project_id)
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
    if not to_delete:
        return {"deleted": 0}
    res = await db.execute(delete(AgentMessage).where(AgentMessage.id.in_(to_delete)))
    n = int(res.rowcount or 0)
    if n:
        _bump_conversation_timestamp(c)
        await delete_conversation_thread(db, conversation_id)
    await db.flush()
    return {"deleted": n}


@router.post(
    "/{project_id}/conversations/{conversation_id}/messages",
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def post_message(
    project_id: str,
    conversation_id: str,
    body: ProjectMessageCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = get_jwt_sub(request)
    project = await _get_project(db, project_id, sub)
    c = await _get_conv(db, conversation_id, sub, project_id)
    user_msg = AgentMessage(
        id=new_id(),
        conversation_id=c.id,
        role="user",
        content=body.content.strip(),
    )
    db.add(user_msg)
    await db.flush()
    await _maybe_set_conversation_title_from_first_user_message(db, c, body.content)
    _bump_conversation_timestamp(c)
    await db.refresh(c, attribute_names=["messages"])
    plan_mode = (body.mode or "").strip().lower() == "plan"
    jwt_payload = request.state.openkms_jwt_payload
    bearer = await ensure_session_api_key(db, c, jwt_payload)
    await ensure_skills_materialized(db, project)

    if body.stream:

        async def stream() -> AsyncIterator[bytes]:
            turn = AgentTurnContext.start(
                project_id=project_id,
                conversation_id=c.id,
                plan_mode=plan_mode,
                streaming=True,
            )
            acc = ProjectStreamAccumulator()
            try:
                yield _ndjson_line({"type": "user", "message": _msg_to_out(user_msg).model_dump(mode="json")})
                assistant_id = new_id()
                async for part in iter_project_stream_parts(
                    db,
                    c,
                    jwt_payload,
                    bearer,
                    project_id,
                    project.name,
                    project.slug,
                    project.description,
                    project.settings or {},
                    plan_mode=plan_mode,
                    session_id=body.session_id,
                    turn=turn,
                ):
                    if acc.absorb(part) == "fatal":
                        err = str(part.get("message") or "Error") if isinstance(part, dict) else "Error"
                        asst = await _persist_stream_error(
                            db,
                            c,
                            turn,
                            err,
                            assistant_id=assistant_id,
                            tool_count=len(acc.tool_traces),
                        )
                        yield _error_ndjson_line(err, asst)
                        return
                    yield _ndjson_line(part)
                content = acc.assistant_text
                tool_payload = {WIKI_TOOL_TRANSCRIPTS_KEY: acc.tool_traces} if acc.tool_traces else None
                asst = AgentMessage(
                    id=assistant_id,
                    conversation_id=c.id,
                    role="assistant",
                    content=content,
                    tool_calls=tool_payload,
                )
                db.add(asst)
                await db.flush()
                turn.log_done(
                    tool_count=len(acc.tool_traces),
                    assistant_chars=len(content or ""),
                    conversation=c,
                )
                yield _ndjson_line(
                    {
                        "type": "done",
                        "assistant": _msg_to_out(asst).model_dump(mode="json"),
                    }
                )
            except Exception as e:
                err = str(e)
                asst = await _persist_stream_error(
                    db, c, turn, err, exc=e, tool_count=len(acc.tool_traces)
                )
                yield _error_ndjson_line(err, asst)

        return StreamingResponse(
            stream(),
            media_type="application/x-ndjson",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    content, tool_calls = await run_project_turn(
        db,
        c,
        jwt_payload,
        bearer,
        project_id,
        project.name,
        project.slug,
        project.description,
        project.settings or {},
        plan_mode=plan_mode,
        session_id=body.session_id,
    )
    asst = AgentMessage(
        id=new_id(),
        conversation_id=c.id,
        role="assistant",
        content=content,
        tool_calls=tool_calls,
    )
    db.add(asst)
    await db.flush()
    return AgentMessagePostResponse(message=_msg_to_out(user_msg), assistant=_msg_to_out(asst))


@router.post(
    "/{project_id}/conversations/{conversation_id}/messages/resume",
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def resume_message(
    project_id: str,
    conversation_id: str,
    body: ProjectMessageResume,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = get_jwt_sub(request)
    project = await _get_project(db, project_id, sub)
    c = await _get_conv(db, conversation_id, sub, project_id)
    jwt_payload = request.state.openkms_jwt_payload
    bearer = await ensure_session_api_key(db, c, jwt_payload)
    await ensure_skills_materialized(db, project)

    async def stream() -> AsyncIterator[bytes]:
        turn = AgentTurnContext.start(
            project_id=project_id,
            conversation_id=c.id,
            streaming=True,
            resume=True,
        )
        acc = ProjectStreamAccumulator()
        try:
            await db.refresh(c, attribute_names=["messages"])
            rows = sorted(c.messages, key=lambda m: (m.created_at, m.id))
            last_asst = next((m for m in reversed(rows) if m.role == "assistant"), None)
            existing_traces: list[dict[str, str]] = []
            if last_asst and isinstance(last_asst.tool_calls, dict):
                raw = last_asst.tool_calls.get(WIKI_TOOL_TRANSCRIPTS_KEY)
                if isinstance(raw, list):
                    existing_traces = [t for t in raw if isinstance(t, dict)]

            async for part in resume_project_interrupt(
                db,
                c,
                project_id,
                project.name,
                project.slug,
                project.description,
                project.settings or {},
                jwt_payload,
                bearer,
                decision=body.decision,
                edited_args=body.edited_args,
                message=body.message,
                turn=turn,
            ):
                status = acc.absorb(part)
                if status == "fatal":
                    err = str(part.get("message") or "Error") if isinstance(part, dict) else "Error"
                    asst = await _persist_stream_error(
                        db,
                        c,
                        turn,
                        err,
                        tool_count=len(existing_traces) + len(acc.tool_traces),
                    )
                    yield _error_ndjson_line(err, asst)
                    return
                yield _ndjson_line(part)

            if acc.interrupted:
                turn.log_done(
                    tool_count=len(acc.tool_traces),
                    assistant_chars=len(acc.assistant_text),
                    conversation=c,
                )
                return

            resume_text = acc.assistant_text
            merged_traces = existing_traces + acc.tool_traces if acc.tool_traces else existing_traces
            tool_payload = {WIKI_TOOL_TRANSCRIPTS_KEY: merged_traces} if merged_traces else None

            if last_asst is not None:
                last_asst.content = (last_asst.content or "") + resume_text
                if tool_payload is not None:
                    last_asst.tool_calls = tool_payload
                await db.flush()
                asst = last_asst
            else:
                asst = AgentMessage(
                    id=new_id(),
                    conversation_id=c.id,
                    role="assistant",
                    content=resume_text,
                    tool_calls=tool_payload,
                )
                db.add(asst)
                await db.flush()
            _bump_conversation_timestamp(c)
            turn.log_done(
                tool_count=len(merged_traces),
                assistant_chars=len(resume_text or ""),
                conversation=c,
            )
            yield _ndjson_line({"type": "done", "assistant": _msg_to_out(asst).model_dump(mode="json")})
        except Exception as e:
            err = str(e)
            asst = await _persist_stream_error(
                db, c, turn, err, exc=e, tool_count=len(acc.tool_traces)
            )
            yield _error_ndjson_line(err, asst)

    return StreamingResponse(
        stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
