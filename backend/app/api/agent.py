"""Embedded LangGraph agent: conversations and messages."""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.database import get_db
from app.models.agent_models import AgentConversation, AgentMessage
from app.models.wiki_models import WikiSpace
from app.schemas.agent import (
    AgentConversationCreate,
    AgentConversationResponse,
    AgentConversationUpdate,
    AgentMessageCreate,
    AgentMessageItem,
    AgentMessagePostResponse,
)
from app.services.data_scope import effective_wiki_space_ids, scope_applies
from app.services.permission_catalog import PERM_WIKIS_READ
from app.services.agent.wiki_runner import iter_wiki_conversation_stream_parts, new_id, run_wiki_conversation_turn

router = APIRouter(prefix="/agent", tags=["agent"])


def _get_sub(request: Request) -> str:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise HTTPException(status_code=401, detail="Not authenticated")
    return sub


async def _ensure_wiki_in_context(
    request: Request,
    db: AsyncSession,
    space_id: str,
) -> None:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    ws = await db.get(WikiSpace, space_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Wiki space not found")
    if isinstance(sub, str) and scope_applies(p, sub):
        allowed = await effective_wiki_space_ids(db, sub)
        if allowed is not None and space_id not in allowed:
            raise HTTPException(status_code=404, detail="Wiki space not found")


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


def _msg_to_out(m: AgentMessage) -> AgentMessageItem:
    return AgentMessageItem(
        id=m.id,
        role=m.role,
        content=m.content,
        tool_calls=m.tool_calls,
        created_at=m.created_at,
    )


async def _maybe_set_conversation_title_from_first_user_message(
    db: AsyncSession, c: AgentConversation, first_user_text: str
) -> None:
    """Set conversation title from the first user line when the row has no title yet."""
    if c.title and c.title.strip():
        return
    t = (first_user_text or "").strip().replace("\n", " ")
    if not t:
        return
    n = (
        await db.execute(
            select(func.count()).select_from(AgentMessage).where(AgentMessage.conversation_id == c.id)
        )
    ).scalar_one()
    if n != 1:
        return
    c.title = f"{t[:100]}…" if len(t) > 100 else t
    await db.flush()


def _bump_conversation_timestamp(c: AgentConversation) -> None:
    c.updated_at = datetime.now(timezone.utc)


@router.post(
    "/conversations",
    response_model=AgentConversationResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def create_conversation(
    request: Request,
    body: AgentConversationCreate,
    db: AsyncSession = Depends(get_db),
):
    sub = _get_sub(request)
    if body.surface != "wiki_space":
        raise HTTPException(status_code=400, detail="Only surface 'wiki_space' is supported")
    w_id = (body.context or {}).get("wiki_space_id")
    if not isinstance(w_id, str) or not w_id.strip():
        raise HTTPException(status_code=400, detail="context.wiki_space_id is required")
    await _ensure_wiki_in_context(request, db, w_id.strip())
    c = AgentConversation(
        id=str(uuid.uuid4()),
        user_sub=sub,
        surface=body.surface,
        context=dict(body.context),
        title=body.title,
    )
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return _conv_to_out(c)


@router.get(
    "/conversations",
    response_model=list[AgentConversationResponse],
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def list_conversations(
    request: Request,
    wiki_space_id: str = Query(min_length=1, description="Must match context.wiki_space_id for surface wiki_space"),
    surface: str = Query(default="wiki_space"),
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Conversations for the current user, filtered by wiki space (most recently updated first)."""
    if surface != "wiki_space":
        raise HTTPException(status_code=400, detail="Only surface=wiki_space is supported")
    w = wiki_space_id.strip()
    if not w:
        raise HTTPException(status_code=400, detail="wiki_space_id is required")
    await _ensure_wiki_in_context(request, db, w)
    sub = _get_sub(request)
    r = await db.execute(
        select(AgentConversation)
        .where(
            AgentConversation.user_sub == sub,
            AgentConversation.surface == surface,
            AgentConversation.context.contains({"wiki_space_id": w}),
        )
        .order_by(AgentConversation.updated_at.desc())
        .limit(limit)
    )
    return [_conv_to_out(c) for c in r.scalars().all()]


@router.delete(
    "/conversations/{conversation_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def delete_conversation(
    request: Request,
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
):
    c = await _get_conversation_for_user(db, conversation_id, _get_sub(request))
    w_id = (c.context or {}).get("wiki_space_id")
    if isinstance(w_id, str) and w_id:
        await _ensure_wiki_in_context(request, db, w_id)
    await db.delete(c)
    await db.flush()


@router.patch(
    "/conversations/{conversation_id}",
    response_model=AgentConversationResponse,
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def patch_conversation(
    request: Request,
    conversation_id: str,
    body: AgentConversationUpdate,
    db: AsyncSession = Depends(get_db),
):
    c = await _get_conversation_for_user(db, conversation_id, _get_sub(request))
    w_id = (c.context or {}).get("wiki_space_id")
    if isinstance(w_id, str) and w_id:
        await _ensure_wiki_in_context(request, db, w_id)
    if body.title is not None:
        c.title = body.title
    await db.flush()
    await db.refresh(c)
    return _conv_to_out(c)


async def _get_conversation_for_user(
    db: AsyncSession, conversation_id: str, sub: str
) -> AgentConversation:
    c = await db.get(AgentConversation, conversation_id)
    if not c or c.user_sub != sub:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return c


@router.get(
    "/conversations/{conversation_id}",
    response_model=AgentConversationResponse,
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def get_conversation(
    request: Request,
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
):
    c = await _get_conversation_for_user(db, conversation_id, _get_sub(request))
    w_id = (c.context or {}).get("wiki_space_id")
    if isinstance(w_id, str) and w_id:
        await _ensure_wiki_in_context(request, db, w_id)
    return _conv_to_out(c)


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[AgentMessageItem],
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def list_conversation_messages(
    request: Request,
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
):
    c = await _get_conversation_for_user(db, conversation_id, _get_sub(request))
    w_id = (c.context or {}).get("wiki_space_id")
    if isinstance(w_id, str) and w_id:
        await _ensure_wiki_in_context(request, db, w_id)
    r = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conversation_id)
        .order_by(AgentMessage.created_at)
    )
    rows = list(r.scalars().all())
    return [_msg_to_out(m) for m in rows]


@router.delete(
    "/conversations/{conversation_id}/messages/from/{message_id}",
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def delete_conversation_messages_from(
    request: Request,
    conversation_id: str,
    message_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    """
    Remove this message and all messages after it in chronological order.
    The user can then re-send (text is pre-filled in the client from the removed user line).
    """
    c = await _get_conversation_for_user(db, conversation_id, _get_sub(request))
    w_id = (c.context or {}).get("wiki_space_id")
    if isinstance(w_id, str) and w_id:
        await _ensure_wiki_in_context(request, db, w_id)
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
    await db.flush()
    return {"deleted": n}


def _ndjson_line(payload: Any) -> bytes:
    return (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")


async def _ndjson_wiki_message_response(
    db: AsyncSession,
    c: AgentConversation,
    jwt_payload: dict[str, Any],
    user_m: AgentMessage,
) -> AsyncIterator[bytes]:
    user_out = _msg_to_out(user_m)
    yield _ndjson_line({"type": "user", "message": user_out.model_dump(mode="json")})
    acc: list[str] = []
    asst_m: AgentMessage
    try:
        async for part in iter_wiki_conversation_stream_parts(db, c, jwt_payload):
            ptype = part.get("type") if isinstance(part, dict) else None
            if ptype == "fatal":
                err = (part.get("message") or "Error") if isinstance(part, dict) else "Error"
                asst_m = AgentMessage(
                    id=new_id(),
                    conversation_id=c.id,
                    role="assistant",
                    content=str(err),
                )
                db.add(asst_m)
                _bump_conversation_timestamp(c)
                await db.flush()
                await db.refresh(asst_m)
                yield _ndjson_line(
                    {
                        "type": "error",
                        "detail": str(err),
                        "message": _msg_to_out(asst_m).model_dump(mode="json"),
                    }
                )
                return
            if ptype == "delta":
                t = part.get("t") if isinstance(part, dict) else None
                if t:
                    acc.append(str(t))
                    yield _ndjson_line({"type": "delta", "t": str(t)})
                continue
            if ptype == "tool_start" and isinstance(part, dict):
                yield _ndjson_line(
                    {
                        "type": "tool_start",
                        "run_id": str(part.get("run_id") or ""),
                        "name": str(part.get("name") or "tool"),
                        "input": str(part.get("input") or ""),
                    }
                )
                continue
            if ptype == "tool_end" and isinstance(part, dict):
                yield _ndjson_line(
                    {
                        "type": "tool_end",
                        "run_id": str(part.get("run_id") or ""),
                        "name": str(part.get("name") or "tool"),
                        "output": str(part.get("output") or ""),
                    }
                )
                continue
            if ptype == "tool_error" and isinstance(part, dict):
                yield _ndjson_line(
                    {
                        "type": "tool_error",
                        "run_id": str(part.get("run_id") or ""),
                        "name": str(part.get("name") or "tool"),
                        "error": str(part.get("error") or "Tool error"),
                    }
                )
                continue
        text = "".join(acc)
        asst_m = AgentMessage(
            id=new_id(),
            conversation_id=c.id,
            role="assistant",
            content=text,
        )
        db.add(asst_m)
        _bump_conversation_timestamp(c)
        await db.flush()
        await db.refresh(asst_m)
        yield _ndjson_line(
            {
                "type": "done",
                "user": user_out.model_dump(mode="json"),
                "message": _msg_to_out(asst_m).model_dump(mode="json"),
            }
        )
    except Exception as e:
        err = str(e) or type(e).__name__
        asst_m = AgentMessage(
            id=new_id(),
            conversation_id=c.id,
            role="assistant",
            content=f"Error: {err}",
        )
        db.add(asst_m)
        _bump_conversation_timestamp(c)
        await db.flush()
        await db.refresh(asst_m)
        yield _ndjson_line(
            {
                "type": "error",
                "detail": err,
                "message": _msg_to_out(asst_m).model_dump(mode="json"),
            }
        )


@router.post(
    "/conversations/{conversation_id}/messages",
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def post_conversation_message(
    request: Request,
    conversation_id: str,
    body: AgentMessageCreate,
    db: AsyncSession = Depends(get_db),
):
    c = await _get_conversation_for_user(db, conversation_id, _get_sub(request))
    w_id = (c.context or {}).get("wiki_space_id")
    if not isinstance(w_id, str) or not w_id.strip():
        raise HTTPException(status_code=400, detail="Invalid conversation context")
    await _ensure_wiki_in_context(request, db, w_id.strip())

    p: dict[str, Any] = request.state.openkms_jwt_payload

    user_m = AgentMessage(
        id=new_id(),
        conversation_id=c.id,
        role="user",
        content=body.content,
    )
    db.add(user_m)
    await db.flush()
    await db.refresh(user_m)
    await _maybe_set_conversation_title_from_first_user_message(db, c, body.content)
    _bump_conversation_timestamp(c)
    await db.flush()

    if body.stream:
        return StreamingResponse(
            _ndjson_wiki_message_response(db, c, p, user_m),
            media_type="application/x-ndjson",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    assistant_text = await run_wiki_conversation_turn(db, c, p)
    asst_m = AgentMessage(
        id=new_id(),
        conversation_id=c.id,
        role="assistant",
        content=assistant_text,
    )
    db.add(asst_m)
    _bump_conversation_timestamp(c)
    await db.flush()
    await db.refresh(asst_m)
    return AgentMessagePostResponse(message=_msg_to_out(user_m), assistant=_msg_to_out(asst_m))
