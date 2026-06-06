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
from app.config import settings
from app.database import get_db
from app.models.agent_models import AgentConversation, AgentMessage
from app.models.project import Project
from app.schemas.agent import AgentConversationResponse, AgentMessageListResponse, AgentMessagePostResponse
from app.schemas.project import ProjectConversationCreate, ProjectConversationPatch, ProjectMessageCreate, ProjectMessageResume
from app.services.agent.llm import resolve_agent_llm_config
from app.services.agent.wiki_runner import WIKI_TOOL_TRANSCRIPTS_KEY
from app.services.conversation_title import suggest_conversation_title
from app.services.deep_agents.runner import iter_project_stream_parts, new_id, resume_project_interrupt, run_project_turn
from app.services.permission_catalog import PERM_PROJECTS_READ, PERM_PROJECTS_WRITE

router = APIRouter()


def _get_sub(request: Request) -> str:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise HTTPException(status_code=401, detail="Not authenticated")
    return sub


def _get_bearer(request: Request) -> str:
    auth = request.headers.get("Authorization") or ""
    if auth.startswith("Bearer "):
        return auth[7:]
    return ""


def _ndjson_line(obj: dict) -> bytes:
    return (json.dumps(obj, ensure_ascii=False, default=str) + "\n").encode()


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
    sub = _get_sub(request)
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
    sub = _get_sub(request)
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
    sub = _get_sub(request)
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
    sub = _get_sub(request)
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
    sub = _get_sub(request)
    await _get_conv(db, conversation_id, sub, project_id)
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
    sub = _get_sub(request)
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
    sub = _get_sub(request)
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
    bearer = _get_bearer(request)

    if body.stream:

        async def stream() -> AsyncIterator[bytes]:
            try:
                yield _ndjson_line({"type": "user", "message": _msg_to_out(user_msg).model_dump(mode="json")})
                assistant_id = new_id()
                text_parts: list[str] = []
                tool_traces: list[dict[str, str]] = []
                tool_inputs: dict[str, str] = {}
                async for part in iter_project_stream_parts(
                    db,
                    c,
                    jwt_payload,
                    bearer,
                    project_id,
                    project.settings or {},
                    plan_mode=plan_mode,
                ):
                    ptype = part.get("type")
                    if ptype == "delta" and part.get("t"):
                        text_parts.append(part["t"])
                    elif ptype == "tool_start":
                        run_id = str(part.get("run_id") or "")
                        inp = part.get("input")
                        if run_id and isinstance(inp, str):
                            tool_inputs[run_id] = inp
                    elif ptype == "tool_end":
                        name = str(part.get("name") or "tool")
                        trace: dict[str, str] = {
                            "name": name,
                            "output": str(part.get("output") or ""),
                        }
                        run_id = str(part.get("run_id") or "")
                        if run_id and run_id in tool_inputs:
                            trace["input"] = tool_inputs[run_id]
                        tool_traces.append(trace)
                    elif ptype == "tool_error":
                        name = str(part.get("name") or "tool")
                        trace = {
                            "name": name,
                            "error": str(part.get("error") or ""),
                        }
                        run_id = str(part.get("run_id") or "")
                        if run_id and run_id in tool_inputs:
                            trace["input"] = tool_inputs[run_id]
                        tool_traces.append(trace)
                    yield _ndjson_line(part)
                    if ptype == "fatal":
                        return
                content = "".join(text_parts)
                tool_payload = {WIKI_TOOL_TRANSCRIPTS_KEY: tool_traces} if tool_traces else None
                asst = AgentMessage(
                    id=assistant_id,
                    conversation_id=c.id,
                    role="assistant",
                    content=content,
                    tool_calls=tool_payload,
                )
                db.add(asst)
                await db.flush()
                yield _ndjson_line(
                    {
                        "type": "done",
                        "assistant": _msg_to_out(asst).model_dump(mode="json"),
                    }
                )
            except Exception as e:
                yield _ndjson_line({"type": "fatal", "message": str(e)})

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
        project.settings or {},
        plan_mode=plan_mode,
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
    sub = _get_sub(request)
    project = await _get_project(db, project_id, sub)
    c = await _get_conv(db, conversation_id, sub, project_id)
    jwt_payload = request.state.openkms_jwt_payload
    bearer = _get_bearer(request)

    async def stream() -> AsyncIterator[bytes]:
        text_parts: list[str] = []
        async for part in resume_project_interrupt(
            db,
            c,
            project_id,
            project.settings or {},
            jwt_payload,
            bearer,
            decision=body.decision,
            edited_args=body.edited_args,
            message=body.message,
        ):
            if part.get("type") == "delta" and part.get("t"):
                text_parts.append(part["t"])
            yield _ndjson_line(part)
        asst = AgentMessage(
            id=new_id(),
            conversation_id=c.id,
            role="assistant",
            content="".join(text_parts),
        )
        db.add(asst)
        await db.flush()
        yield _ndjson_line({"type": "done", "assistant": _msg_to_out(asst).model_dump(mode="json")})

    return StreamingResponse(
        stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
