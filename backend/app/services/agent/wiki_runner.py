"""Run one turn of the wiki-space LangGraph agent."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, AsyncIterator, Literal, TypedDict
from uuid import uuid4

from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.errors import GraphRecursionError
from langgraph.prebuilt import create_react_agent
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.agent_models import AgentConversation, AgentMessage
from app.services.agent.llm import resolve_agent_llm_config
from app.services.agent.prompts import build_wiki_space_system_prompt
from app.services.agent.wiki_tools import make_wiki_tools


def _lc_messages_from_db(rows: list[AgentMessage]) -> list[BaseMessage]:
    out: list[BaseMessage] = []
    for m in rows:
        if m.role == "user":
            out.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            out.append(AIMessage(content=m.content))
    return out


def _normalize_openai_base_url(url: str) -> str:
    b = (url or "").rstrip("/")
    if b.endswith("/v1"):
        return b
    return f"{b}/v1"


def _agent_runnable_config() -> dict[str, Any]:
    """LangGraph stops after `recursion_limit` supersteps (default was 25; too low for bulk tool use)."""
    return {"recursion_limit": settings.agent_recursion_limit}


def _recursion_limit_exceeded_message() -> str:
    return (
        f"Error: the agent hit the maximum number of tool/model steps ({settings.agent_recursion_limit}, "
        f"set **OPENKMS_AGENT_RECURSION_LIMIT** to raise it). For large batches, process **3–5 pages per message** "
        "or ask the user to say “continue” after each batch."
    )


@dataclass
class _WikiRunCtx:
    err: str | None
    agent: Any
    messages: list[BaseMessage]


async def _load_wiki_run_context(
    db: AsyncSession,
    conversation: AgentConversation,
    jwt_payload: dict[str, Any],
    *,
    use_streaming: bool,
) -> _WikiRunCtx:
    wiki_space_id = (conversation.context or {}).get("wiki_space_id")
    if not isinstance(wiki_space_id, str) or not wiki_space_id.strip():
        return _WikiRunCtx("Error: missing wiki_space_id in conversation context.", None, [])

    llm_cfg = await resolve_agent_llm_config(db)
    if not llm_cfg:
        return _WikiRunCtx(
            "Error: no LLM is configured. Add an **LLM** on **Models** and set it as the default for the LLM category, or set **OPENKMS_AGENT_MODEL_ID**.",
            None,
            [],
        )

    result = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conversation.id)
        .order_by(AgentMessage.created_at)
    )
    history_rows = list(result.scalars().all())
    if not history_rows:
        return _WikiRunCtx("Error: no messages in conversation.", None, [])
    if history_rows[-1].role != "user":
        return _WikiRunCtx("Error: the latest message is not a user message.", None, [])

    tools, can_write = await make_wiki_tools(db, wiki_space_id.strip(), jwt_payload)
    llm = ChatOpenAI(
        base_url=_normalize_openai_base_url(llm_cfg["base_url"]),
        api_key=llm_cfg["api_key"],
        model=llm_cfg["model_name"],
        temperature=0.2,
        max_tokens=settings.agent_max_output_tokens,
        streaming=use_streaming,
    )
    agent = create_react_agent(
        llm,
        tools,
        prompt=build_wiki_space_system_prompt(has_write_tools=can_write),
    )
    messages: list[BaseMessage] = _lc_messages_from_db(history_rows)
    return _WikiRunCtx(None, agent, messages)


def _extract_text_from_aimessage_content(content: str | list[str | dict] | None) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for b in content:
            if isinstance(b, str):
                parts.append(b)
            elif isinstance(b, dict) and b.get("type") == "text" and b.get("text"):
                parts.append(str(b["text"]))
        return "".join(parts)
    return str(content) if content else ""


def _message_to_stream_text_raw(m: Any) -> str:
    """Text deltas (may be partial). Do not strip, to preserve inter-token spaces."""
    if m is None:
        return ""
    if not isinstance(m, (AIMessage, AIMessageChunk)) and not hasattr(m, "content"):
        return ""
    try:
        return _extract_text_from_aimessage_content(m.content)  # type: ignore[arg-type]
    except Exception:
        return ""


def _tool_io_preview(x: Any, max_len: int) -> str:
    """JSON-serializable string for tool args/results (NDJSON to browser)."""
    if x is None:
        return ""
    try:
        s = x if isinstance(x, str) else json.dumps(x, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        s = str(x)
    if len(s) > max_len:
        return s[: max_len - 18] + "…[truncated]"
    return s


class WikiStreamPart(TypedDict, total=False):
    type: Literal["delta", "tool_start", "tool_end", "tool_error", "fatal"]
    t: str
    run_id: str
    name: str
    input: str
    output: str
    error: str
    message: str


async def iter_wiki_conversation_stream_parts(
    db: AsyncSession,
    conversation: AgentConversation,
    jwt_payload: dict[str, Any],
) -> AsyncIterator[WikiStreamPart]:
    """
    Stream model tokens (delta) and tool lifecycle events (via LangChain astream_events v2),
    for Cursor-style tool UI in the wiki assistant.
    """
    ctx = await _load_wiki_run_context(db, conversation, jwt_payload, use_streaming=True)
    if ctx.err or not ctx.agent:
        yield {
            "type": "fatal",
            "message": ctx.err or "Error: agent failed to initialize.",
        }
        return

    any_text = False
    try:
        async for ev in ctx.agent.astream_events(  # type: ignore[union-attr]
            {"messages": ctx.messages},
            _agent_runnable_config(),
            version="v2",
        ):
            ename = (ev.get("event") or "") if isinstance(ev, dict) else ""
            if ename == "on_chat_model_stream":
                ch = (ev.get("data") or {}).get("chunk")
                t = _message_to_stream_text_raw(ch)
                if t:
                    any_text = True
                    yield {"type": "delta", "t": t}
            elif ename == "on_tool_start":
                name = (ev.get("name") or "tool").split("/")[-1]
                data = ev.get("data") or {}
                inp = data.get("input")
                run_id = str(ev.get("run_id") or "")
                yield {
                    "type": "tool_start",
                    "run_id": run_id,
                    "name": name,
                    "input": _tool_io_preview(inp, 6_000),
                }
            elif ename == "on_tool_end":
                data = ev.get("data") or {}
                out = data.get("output")
                run_id = str(ev.get("run_id") or "")
                name = (ev.get("name") or "tool").split("/")[-1]
                yield {
                    "type": "tool_end",
                    "run_id": run_id,
                    "name": name,
                    "output": _tool_io_preview(out, 10_000),
                }
            elif ename == "on_tool_error":
                data = ev.get("data") or {}
                err = data.get("error")
                err_s = str(err) if err is not None else "Tool error"
                run_id = str(ev.get("run_id") or "")
                name = (ev.get("name") or "tool").split("/")[-1]
                yield {
                    "type": "tool_error",
                    "run_id": run_id,
                    "name": name,
                    "error": _tool_io_preview(err_s, 2_000),
                }
    except GraphRecursionError as e:
        yield {"type": "fatal", "message": f"{_recursion_limit_exceeded_message()} ({e!s})"}
        return
    if not any_text:
        try:
            out = await ctx.agent.ainvoke({"messages": ctx.messages}, _agent_runnable_config())
        except GraphRecursionError as e:
            yield {"type": "fatal", "message": f"{_recursion_limit_exceeded_message()} ({e!s})"}
            return
        final = _extract_assistant_text_from_ainvoke_out(out)
        if not final or final.startswith("Error:"):
            yield {"type": "fatal", "message": final or "Error: no response"}
        else:
            yield {"type": "delta", "t": final}


async def run_wiki_conversation_turn(
    db: AsyncSession,
    conversation: AgentConversation,
    jwt_payload: dict[str, Any],
) -> str:
    """Run the agent on the current DB message history (last turn must be user). Return assistant text."""
    ctx = await _load_wiki_run_context(db, conversation, jwt_payload, use_streaming=False)
    if ctx.err or not ctx.agent:
        return ctx.err or "Error: agent failed to initialize."

    try:
        out = await ctx.agent.ainvoke({"messages": ctx.messages}, _agent_runnable_config())
    except GraphRecursionError as e:
        return _recursion_limit_exceeded_message() + f" ({e!s})"
    return _extract_assistant_text_from_ainvoke_out(out)


def _extract_assistant_text_from_ainvoke_out(out: dict[str, Any]) -> str:
    out_msgs: list[BaseMessage] = out.get("messages") or []
    if not out_msgs:
        return "Error: empty model response."
    last = out_msgs[-1]
    if isinstance(last, AIMessage) and last.content:
        if isinstance(last.content, str):
            return last.content
        if isinstance(last.content, list):
            parts: list[str] = []
            for b in last.content:
                if isinstance(b, str):
                    parts.append(b)
                elif isinstance(b, dict) and b.get("type") == "text" and b.get("text"):
                    parts.append(str(b["text"]))
            return "\n".join(parts) if parts else "Error: could not read assistant message."
    return "Error: could not read assistant message."


def new_id() -> str:
    return str(uuid4())
