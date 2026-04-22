"""Run one turn of the wiki-space LangGraph agent."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, AsyncIterator
from uuid import uuid4

from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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

    tools = make_wiki_tools(db, wiki_space_id.strip(), jwt_payload)
    llm = ChatOpenAI(
        base_url=_normalize_openai_base_url(llm_cfg["base_url"]),
        api_key=llm_cfg["api_key"],
        model=llm_cfg["model_name"],
        temperature=0.2,
        streaming=use_streaming,
    )
    agent = create_react_agent(
        llm,
        tools,
        prompt=build_wiki_space_system_prompt(),
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
    if not isinstance(m, (AIMessage, AIMessageChunk)):
        return ""
    return _extract_text_from_aimessage_content(m.content)


async def run_wiki_conversation_turn(
    db: AsyncSession,
    conversation: AgentConversation,
    jwt_payload: dict[str, Any],
) -> str:
    """Run the agent on the current DB message history (last turn must be user). Return assistant text."""
    ctx = await _load_wiki_run_context(db, conversation, jwt_payload, use_streaming=False)
    if ctx.err or not ctx.agent:
        return ctx.err or "Error: agent failed to initialize."

    out = await ctx.agent.ainvoke({"messages": ctx.messages})
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


async def iter_wiki_conversation_deltas(
    db: AsyncSession,
    conversation: AgentConversation,
    jwt_payload: dict[str, Any],
) -> AsyncIterator[str]:
    """Stream assistant text as token/segment deltas (LangGraph + streaming ChatOpenAI). Yields a leading ``__FATAL__``+msg segment on configuration errors; otherwise only model text deltas (and possibly one fallback string)."""
    ctx = await _load_wiki_run_context(db, conversation, jwt_payload, use_streaming=True)
    if ctx.err or not ctx.agent:
        if ctx.err:
            yield f"__FATAL__{ctx.err}"
        else:
            yield "__FATAL__Error: agent failed to initialize."
        return

    any_delta = False
    async for item in ctx.agent.astream(
        {"messages": ctx.messages},
        stream_mode="messages",
    ):
        token_msg: Any
        if isinstance(item, (tuple, list)) and len(item) >= 2:
            token_msg, _ = item[0], item[1]
        else:
            token_msg = item
        t = _message_to_stream_text_raw(token_msg)
        if t:
            any_delta = True
            yield t
    if not any_delta:
        # If the model did not emit message-mode chunks, fall back to a non-streaming invoke
        # (rare: may run the graph a second time on the same state).
        out = await ctx.agent.ainvoke({"messages": ctx.messages})
        final = _extract_assistant_text_from_ainvoke_out(out)
        if not final or final.startswith("Error:"):
            yield f"__FATAL__{final or 'Error: no response'}"
        else:
            yield final


def new_id() -> str:
    return str(uuid4())
