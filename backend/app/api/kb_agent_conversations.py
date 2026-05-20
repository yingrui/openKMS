"""KB Q&A chat threads: reuse ``agent_conversations`` / ``agent_messages`` with ``surface=knowledge_base``."""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.agent import (
    _bump_conversation_timestamp,
    _maybe_set_conversation_title_from_first_user_message,
    _msg_to_out,
    _ndjson_line,
)
from app.api.auth import require_auth
from app.api.knowledge_bases import get_kb_scoped
from app.database import get_db
from app.models.agent_models import AgentConversation, AgentMessage
from app.models.knowledge_base import KnowledgeBase
from app.schemas.agent import AgentConversationResponse, AgentMessageItem, AgentMessagePostResponse
from app.schemas.knowledge_base import SearchResult
from app.services.agent.wiki_runner import (
    WIKI_TOOL_TRANSCRIPTS_KEY,
    new_id,
    truncate_wiki_tool_output_for_storage,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["knowledge-bases"])

KB_QA_SOURCES_KEY = "kb_qa_sources_v1"


def _get_sub(request: Request) -> str:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise HTTPException(status_code=401, detail="Not authenticated")
    return sub


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


async def _get_kb_conversation(
    db: AsyncSession, conversation_id: str, sub: str, kb_id: str
) -> AgentConversation:
    c = await db.get(AgentConversation, conversation_id)
    if not c or c.user_sub != sub:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if c.surface != "knowledge_base":
        raise HTTPException(status_code=404, detail="Conversation not found")
    ctx_kb = (c.context or {}).get("knowledge_base_id")
    if ctx_kb != kb_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return c


class KbAgentConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=512)


class KbAgentConversationPatch(BaseModel):
    title: str | None = Field(default=None, max_length=512)


class KbAgentMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=48000)
    stream: bool = False
    session_id: str | None = None


def _history_before_new_user(msgs: list[AgentMessage]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for m in msgs[:-1]:
        if m.role in ("user", "assistant"):
            out.append({"role": m.role, "content": m.content or ""})
    return out


def _sources_to_json(sources: list[SearchResult]) -> list[dict[str, Any]]:
    return [s.model_dump(mode="json") for s in sources]


def _parse_sources(raw: Any) -> list[SearchResult]:
    if not isinstance(raw, list):
        return []
    out: list[SearchResult] = []
    for item in raw:
        if isinstance(item, dict):
            try:
                out.append(SearchResult.model_validate(item))
            except Exception:  # noqa: BLE001
                continue
    return out


@router.get(
    "/{kb_id}/agent-conversations",
    response_model=list[AgentConversationResponse],
    dependencies=[Depends(require_auth)],
)
async def list_kb_agent_conversations(
    kb_id: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=100),
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    _ = kb
    sub = _get_sub(request)
    r = await db.execute(
        select(AgentConversation)
        .where(
            AgentConversation.user_sub == sub,
            AgentConversation.surface == "knowledge_base",
            AgentConversation.context.contains({"knowledge_base_id": kb_id}),
        )
        .order_by(AgentConversation.updated_at.desc())
        .limit(limit)
    )
    return [_conv_to_out(c) for c in r.scalars().all()]


@router.post(
    "/{kb_id}/agent-conversations",
    response_model=AgentConversationResponse,
    status_code=201,
    dependencies=[Depends(require_auth)],
)
async def create_kb_agent_conversation(
    kb_id: str,
    request: Request,
    body: KbAgentConversationCreate,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    _ = kb
    sub = _get_sub(request)
    c = AgentConversation(
        id=str(uuid.uuid4()),
        user_sub=sub,
        surface="knowledge_base",
        context={"knowledge_base_id": kb_id},
        title=body.title,
    )
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return _conv_to_out(c)


@router.delete(
    "/{kb_id}/agent-conversations/{conversation_id}",
    status_code=204,
    dependencies=[Depends(require_auth)],
)
async def delete_kb_agent_conversation(
    kb_id: str,
    conversation_id: str,
    request: Request,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    _ = kb
    c = await _get_kb_conversation(db, conversation_id, _get_sub(request), kb_id)
    await db.delete(c)
    await db.flush()


@router.patch(
    "/{kb_id}/agent-conversations/{conversation_id}",
    response_model=AgentConversationResponse,
    dependencies=[Depends(require_auth)],
)
async def patch_kb_agent_conversation(
    kb_id: str,
    conversation_id: str,
    request: Request,
    body: KbAgentConversationPatch,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    _ = kb
    c = await _get_kb_conversation(db, conversation_id, _get_sub(request), kb_id)
    if body.title is not None:
        c.title = body.title
    await db.flush()
    await db.refresh(c)
    return _conv_to_out(c)


@router.get(
    "/{kb_id}/agent-conversations/{conversation_id}/messages",
    response_model=list[AgentMessageItem],
    dependencies=[Depends(require_auth)],
)
async def list_kb_agent_messages(
    kb_id: str,
    conversation_id: str,
    request: Request,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    _ = kb
    await _get_kb_conversation(db, conversation_id, _get_sub(request), kb_id)
    r = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conversation_id)
        .order_by(AgentMessage.created_at)
    )
    return [_msg_to_out(m) for m in r.scalars().all()]


@router.delete(
    "/{kb_id}/agent-conversations/{conversation_id}/messages/from/{message_id}",
    dependencies=[Depends(require_auth)],
)
async def delete_kb_agent_messages_from(
    kb_id: str,
    conversation_id: str,
    message_id: str,
    request: Request,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    _ = kb
    c = await _get_kb_conversation(db, conversation_id, _get_sub(request), kb_id)
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


async def _run_kb_ask_non_stream(
    kb: KnowledgeBase,
    kb_id: str,
    question: str,
    history: list[dict[str, str]],
    token: str,
    session_id: str | None,
) -> tuple[str, list[SearchResult]]:
    if not kb.agent_url:
        raise HTTPException(status_code=400, detail="No agent URL configured for this knowledge base")
    agent_url = kb.agent_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{agent_url}/ask",
                json={
                    "knowledge_base_id": kb_id,
                    "question": question,
                    "conversation_history": history,
                    "access_token": token,
                    "session_id": session_id,
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        logger.error("Agent returned error: %s %s", e.response.status_code, e.response.text[:200])
        raise HTTPException(status_code=502, detail="Agent service returned an error") from e
    except Exception as e:
        logger.error("Failed to reach agent at %s: %s", agent_url, e)
        raise HTTPException(status_code=502, detail="Could not reach agent service") from e
    answer = str(data.get("answer", "") or "")
    raw_sources = data.get("sources", [])
    sources = _parse_sources(raw_sources)
    return answer, sources


def _assistant_tool_payload(
    tool_traces: list[dict[str, str]], sources: list[SearchResult]
) -> dict[str, Any] | None:
    tool_payload: dict[str, Any] = {}
    if tool_traces:
        tool_payload[WIKI_TOOL_TRANSCRIPTS_KEY] = tool_traces
    if sources:
        tool_payload[KB_QA_SOURCES_KEY] = _sources_to_json(sources)
    return tool_payload or None


async def _ndjson_kb_qa_stream_persist(
    db: AsyncSession,
    kb: KnowledgeBase,
    kb_id: str,
    c: AgentConversation,
    user_m: AgentMessage,
    token: str,
    session_id: str | None,
    question: str,
    history: list[dict[str, str]],
) -> AsyncIterator[bytes]:
    user_out = _msg_to_out(user_m)
    yield _ndjson_line({"type": "user", "message": user_out.model_dump(mode="json")})

    if not kb.agent_url:
        err = "No agent URL configured for this knowledge base"
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
        return

    agent_url = kb.agent_url.rstrip("/")
    acc: list[str] = []
    tool_traces: list[dict[str, str]] = []
    terminal = False

    async def _consume_parsed_line(raw_line: bytes, ev: dict[str, Any]) -> AsyncIterator[bytes]:
        nonlocal acc, tool_traces, terminal
        typ = ev.get("type")
        if typ == "done":
            answer = str(ev.get("answer", "") or "")
            sources = _parse_sources(ev.get("sources"))
            asst_m = AgentMessage(
                id=new_id(),
                conversation_id=c.id,
                role="assistant",
                content=answer,
                tool_calls=_assistant_tool_payload(tool_traces, sources),
            )
            db.add(asst_m)
            _bump_conversation_timestamp(c)
            await db.flush()
            await db.refresh(asst_m)
            done_out = {
                "type": "done",
                "answer": answer,
                "sources": _sources_to_json(sources),
                "user": user_out.model_dump(mode="json"),
                "message": _msg_to_out(asst_m).model_dump(mode="json"),
            }
            yield (json.dumps(done_out, ensure_ascii=False) + "\n").encode("utf-8")
            terminal = True
            return
        if typ == "error":
            detail = str(ev.get("detail") or "Error")
            partial = str(ev.get("answer") or "")
            content = partial.strip() or f"Error: {detail}"
            asst_m = AgentMessage(
                id=new_id(),
                conversation_id=c.id,
                role="assistant",
                content=content,
                tool_calls=_assistant_tool_payload(tool_traces, []),
            )
            db.add(asst_m)
            _bump_conversation_timestamp(c)
            await db.flush()
            await db.refresh(asst_m)
            yield _ndjson_line(
                {
                    "type": "error",
                    "detail": detail,
                    "message": _msg_to_out(asst_m).model_dump(mode="json"),
                }
            )
            terminal = True
            return
        if typ == "delta" and isinstance(ev.get("t"), str):
            acc.append(str(ev["t"]))
        elif typ == "tool_end" and isinstance(ev.get("name"), str):
            tname = str(ev.get("name") or "tool")
            tout = str(ev.get("output") or "")
            if tout.strip():
                tool_traces.append(
                    {
                        "name": tname,
                        "output": truncate_wiki_tool_output_for_storage(tout),
                    }
                )
        elif typ == "tool_error" and isinstance(ev.get("name"), str):
            tname = str(ev.get("name") or "tool")
            terr = str(ev.get("error") or "Tool error")
            tool_traces.append(
                {
                    "name": tname,
                    "output": truncate_wiki_tool_output_for_storage(terr),
                }
            )
        yield raw_line + b"\n"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{agent_url}/ask/stream",
                json={
                    "knowledge_base_id": kb_id,
                    "question": question,
                    "conversation_history": history,
                    "access_token": token,
                    "session_id": session_id,
                },
            ) as resp:
                if resp.status_code >= 400:
                    err_body = (await resp.aread()).decode("utf-8", errors="replace")[:800]
                    err = err_body or f"HTTP {resp.status_code}"
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
                    return

                buf = b""
                async for chunk in resp.aiter_bytes():
                    buf += chunk
                    while b"\n" in buf:
                        raw_line, buf = buf.split(b"\n", 1)
                        if not raw_line.strip():
                            continue
                        text = raw_line.decode("utf-8", errors="replace")
                        try:
                            ev = json.loads(text)
                        except json.JSONDecodeError:
                            continue
                        if not isinstance(ev, dict):
                            yield raw_line + b"\n"
                            continue
                        async for outb in _consume_parsed_line(raw_line, ev):
                            yield outb
                        if terminal:
                            return

                tail = buf.strip()
                if tail:
                    text = tail.decode("utf-8", errors="replace")
                    try:
                        ev = json.loads(text)
                    except json.JSONDecodeError:
                        pass
                    else:
                        if isinstance(ev, dict):
                            async for outb in _consume_parsed_line(tail, ev):
                                yield outb
                            if terminal:
                                return

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
        return

    text = "".join(acc).strip()
    asst_m = AgentMessage(
        id=new_id(),
        conversation_id=c.id,
        role="assistant",
        content=text or "Error: incomplete response from agent",
        tool_calls=_assistant_tool_payload(tool_traces, []),
    )
    db.add(asst_m)
    _bump_conversation_timestamp(c)
    await db.flush()
    await db.refresh(asst_m)
    yield _ndjson_line(
        {
            "type": "error",
            "detail": "incomplete response from agent",
            "message": _msg_to_out(asst_m).model_dump(mode="json"),
        }
    )


@router.post(
    "/{kb_id}/agent-conversations/{conversation_id}/messages",
    dependencies=[Depends(require_auth)],
)
async def post_kb_agent_message(
    kb_id: str,
    conversation_id: str,
    request: Request,
    body: KbAgentMessageCreate,
    token: str = Depends(require_auth),
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    c = await _get_kb_conversation(db, conversation_id, _get_sub(request), kb_id)
    if not kb.agent_url:
        raise HTTPException(status_code=400, detail="No agent URL configured for this knowledge base")

    r = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == c.id)
        .order_by(AgentMessage.created_at)
    )
    prior_rows = list(r.scalars().all())

    user_m = AgentMessage(
        id=new_id(),
        conversation_id=c.id,
        role="user",
        content=body.content,
    )
    db.add(user_m)
    await db.flush()
    await db.refresh(user_m)

    all_rows = prior_rows + [user_m]
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
