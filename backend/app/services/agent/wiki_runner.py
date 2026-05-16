"""Run one turn of the wiki-space LangGraph agent."""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, AsyncIterator, Literal, TypedDict
from urllib.parse import urlparse
from uuid import uuid4

from langchain_core.language_models import LanguageModelInput
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage, HumanMessage, ToolMessage
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

logger = logging.getLogger(__name__)

# Persisted on AgentMessage.tool_calls under this key (visible text stays in content).
WIKI_TOOL_TRANSCRIPTS_KEY = "wiki_tool_traces_v1"
_MAX_TOOL_OUTPUT_STORAGE = 48_000


def truncate_wiki_tool_output_for_storage(text: str, max_len: int = _MAX_TOOL_OUTPUT_STORAGE) -> str:
    t = text or ""
    suffix = "\n…[truncated for storage]"
    if len(t) + len(suffix) <= max_len:
        return t
    head = max_len - len(suffix)
    if head < 1:
        return suffix[:max_len]
    return t[:head] + suffix


def wiki_tool_traces_from_lc_messages(messages: list[Any]) -> list[dict[str, str]]:
    """Collect ToolMessage bodies from a LangGraph invoke result (for DB persistence)."""
    out: list[dict[str, str]] = []
    for m in messages:
        if not isinstance(m, ToolMessage):
            continue
        name = getattr(m, "name", None) or "tool"
        raw = m.content
        if isinstance(raw, str):
            body = raw
        else:
            body = json.dumps(raw, ensure_ascii=False, default=str) if raw is not None else ""
        out.append({"name": name, "output": truncate_wiki_tool_output_for_storage(body)})
    return out


def assistant_lc_content_from_db_row(content: str, tool_calls: list | dict | None) -> str:
    """Rebuild assistant text for the model: user-visible content plus stored tool outputs."""
    vis = (content or "").strip()
    traces: list[dict[str, str]] = []
    if isinstance(tool_calls, dict):
        raw = tool_calls.get(WIKI_TOOL_TRANSCRIPTS_KEY)
        if isinstance(raw, list):
            for item in raw:
                if (
                    isinstance(item, dict)
                    and isinstance(item.get("name"), str)
                    and isinstance(item.get("output"), str)
                ):
                    traces.append({"name": item["name"], "output": item["output"]})
    if not traces:
        return content or ""
    blocks = [f"### Tool `{t['name']}` result\n\n{t['output']}" for t in traces]
    section = "\n\n".join(blocks)
    if vis:
        return f"{vis}\n\n---\n\n{section}"
    return section


def _lc_messages_from_db(rows: list[AgentMessage]) -> list[BaseMessage]:
    out: list[BaseMessage] = []
    for m in rows:
        if m.role == "user":
            out.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            out.append(AIMessage(content=assistant_lc_content_from_db_row(m.content, m.tool_calls)))
    return out


def _normalize_openai_base_url(url: str) -> str:
    b = (url or "").rstrip("/")
    if b.endswith("/v1"):
        return b
    return f"{b}/v1"


def _wiki_use_llm_reasoning_content_shim(base_url: str) -> bool:
    """Whether to use ``ChatOpenAI`` subclass that sets ``reasoning_content`` on assistant message dicts (OpenAI SDK only).

    **auto** (unset): on for every ``base_url`` except ``api.openai.com`` (public OpenAI API), so generic OpenAI-compat
    proxies still get the shim without env tuning. Set **OPENKMS_AGENT_LLM_REASONING_CONTENT_SHIM=0** to disable.
    """
    raw = (settings.agent_llm_reasoning_content_shim or "").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    if raw in ("1", "true", "yes", "on", "force"):
        return True
    try:
        host = (urlparse(base_url).hostname or "").lower()
    except ValueError:
        host = ""
    if host == "api.openai.com":
        return False
    return True


class _WikiReasoningContentShimChatOpenAI(ChatOpenAI):
    """OpenAI chat-completions path only: inject ``reasoning_content`` on assistant dicts when the gateway requires it."""

    def _get_request_payload(
        self,
        input_: LanguageModelInput,
        *,
        stop: list[str] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        payload = super()._get_request_payload(input_, stop=stop, **kwargs)
        if self._use_responses_api(payload):
            return payload
        raw_messages = payload.get("messages")
        if not isinstance(raw_messages, list):
            return payload
        for row in raw_messages:
            if isinstance(row, dict) and row.get("role") == "assistant":
                row["reasoning_content"] = row.get("reasoning_content") or ""
        return payload


def _make_wiki_chat_openai(
    *,
    base_url: str,
    api_key: str,
    model_name: str,
    use_streaming: bool,
) -> ChatOpenAI:
    common: dict[str, Any] = {
        "base_url": base_url,
        "api_key": api_key,
        "model": model_name,
        "temperature": 0.2,
        "max_tokens": settings.agent_max_output_tokens,
        "streaming": use_streaming,
        "extra_body": _wiki_agent_chat_extra_body(),
    }
    if _wiki_use_llm_reasoning_content_shim(base_url):
        return _WikiReasoningContentShimChatOpenAI(**common)
    return ChatOpenAI(**common)


def _wiki_agent_chat_extra_body() -> dict[str, Any]:
    """Wiki Copilot does not support thinking/reasoning round-trip; always disable for OpenAI-compat."""
    merged: dict[str, Any] = {}
    raw = (settings.agent_llm_extra_body_json or "").strip()
    if raw:
        try:
            obj = json.loads(raw)
            if isinstance(obj, dict):
                merged.update(obj)
        except (json.JSONDecodeError, TypeError):
            pass
    merged["enable_thinking"] = False
    return merged


def _wiki_sanitize_aimessage_for_llm(msg: AIMessage) -> AIMessage:
    """Drop thinking/reasoning blocks and provider kwargs LangChain does not echo to OpenAI-compat APIs.

    Some gateways require ``reasoning_content`` on follow-up turns when thinking was used; ``ChatOpenAI`` does not
    preserve those fields. Rebuilding assistant rows avoids mismatches while ``enable_thinking`` stays false in
    ``extra_body``.
    """
    content: str | list[Any] | None = msg.content
    if isinstance(content, list):
        cleaned: list[Any] = []
        for block in content:
            if isinstance(block, dict):
                bt = block.get("type")
                if bt in ("reasoning", "thinking", "reasoning_content", "tool_call"):
                    continue
                if bt == "text" and isinstance(block.get("text"), str):
                    cleaned.append({"type": "text", "text": block["text"]})
                else:
                    cleaned.append(block)
            else:
                cleaned.append(block)
        if not cleaned:
            content = ""
        else:
            content = cleaned

    return AIMessage(
        content=content,
        tool_calls=list(msg.tool_calls) if msg.tool_calls else [],
        invalid_tool_calls=list(msg.invalid_tool_calls) if msg.invalid_tool_calls else [],
        id=msg.id,
        name=msg.name,
    )


def _wiki_sanitize_messages_for_wiki_llm(messages: list[BaseMessage]) -> list[BaseMessage]:
    out: list[BaseMessage] = []
    for m in messages:
        if isinstance(m, AIMessage):
            out.append(_wiki_sanitize_aimessage_for_llm(m))
        else:
            out.append(m)
    return out


def _wiki_pre_model_sanitize_llm_input(state: Mapping[str, Any]) -> dict[str, Any]:
    """LangGraph ``pre_model_hook``: sanitized copy of history for the LLM only (state messages unchanged)."""
    raw = state.get("messages")
    if raw is None:
        return {"llm_input_messages": []}
    return {"llm_input_messages": _wiki_sanitize_messages_for_wiki_llm(list(raw))}


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
    base_url = _normalize_openai_base_url(llm_cfg["base_url"])
    shim = _wiki_use_llm_reasoning_content_shim(base_url)
    if settings.debug:
        logger.debug(
            "wiki_copilot_llm model=%s base_url=%s reasoning_content_shim=%s",
            llm_cfg.get("model_name"),
            base_url,
            shim,
        )
    llm = _make_wiki_chat_openai(
        base_url=base_url,
        api_key=llm_cfg["api_key"],
        model_name=llm_cfg["model_name"],
        use_streaming=use_streaming,
    )
    agent = create_react_agent(
        llm,
        tools,
        prompt=build_wiki_space_system_prompt(has_write_tools=can_write),
        pre_model_hook=_wiki_pre_model_sanitize_llm_input,
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
    """Text deltas from stream chunks (partial). Do not strip, to preserve inter-token spaces."""
    if m is None:
        return ""
    if not isinstance(m, (AIMessage, AIMessageChunk)) and not hasattr(m, "content"):
        return ""
    try:
        return _extract_text_from_aimessage_content(m.content)  # type: ignore[arg-type]
    except Exception:
        return ""


def _visible_assistant_text_from_added_messages(added: list[BaseMessage]) -> str:
    """Concatenate user-visible text from AIMessages in one graph turn (excludes tool JSON)."""
    parts: list[str] = []
    for m in added:
        if isinstance(m, AIMessage):
            t = _extract_text_from_aimessage_content(m.content)
            if t.strip():
                parts.append(t.strip())
    return "\n\n".join(parts) if parts else ""


def _tool_calls_from_ai(m: AIMessage) -> list[dict[str, Any]]:
    raw = m.tool_calls
    if not raw:
        return []
    out: list[dict[str, Any]] = []
    for tc in raw:
        if isinstance(tc, dict):
            out.append(tc)
    return out


async def _replay_wiki_invoke_to_stream(
    before: list[BaseMessage], out: dict[str, Any]
) -> AsyncIterator[WikiStreamPart]:
    """Turn a completed `ainvoke` result into the same NDJSON-shaped stream parts the UI expects."""
    after: list[BaseMessage] = list(out.get("messages") or [])
    if len(after) <= len(before):
        yield {"type": "fatal", "message": "Error: agent returned no new messages."}
        return
    added = after[len(before) :]
    any_text = False
    saw_tool = False
    i = 0
    while i < len(added):
        m = added[i]
        if isinstance(m, AIMessage):
            txt = _extract_text_from_aimessage_content(m.content)
            if txt.strip():
                any_text = True
                yield {"type": "delta", "t": txt}
            calls = _tool_calls_from_ai(m)
            if calls:
                for tc in calls:
                    tid = str(tc.get("id") or new_id())
                    name = str(tc.get("name") or "tool")
                    args = tc.get("args")
                    yield {
                        "type": "tool_start",
                        "run_id": tid,
                        "name": name,
                        "input": _tool_io_preview(args, 6_000),
                    }
                i += 1
                while i < len(added) and isinstance(added[i], ToolMessage):
                    tm = added[i]
                    saw_tool = True
                    run_id = str(getattr(tm, "tool_call_id", "") or "")
                    tname = str(getattr(tm, "name", None) or "tool")
                    tout = tm.content
                    yield {
                        "type": "tool_end",
                        "run_id": run_id,
                        "name": tname,
                        "output": _tool_io_preview(tout, 10_000),
                    }
                    i += 1
                continue
            i += 1
        elif isinstance(m, ToolMessage):
            saw_tool = True
            run_id = str(getattr(m, "tool_call_id", "") or "")
            tname = str(getattr(m, "name", None) or "tool")
            yield {
                "type": "tool_end",
                "run_id": run_id,
                "name": tname,
                "output": _tool_io_preview(m.content, 10_000),
            }
            i += 1
        else:
            i += 1

    if not any_text:
        if saw_tool:
            yield {
                "type": "fatal",
                "message": "Error: the model finished tool calls but produced no text reply.",
            }
        else:
            yield {"type": "fatal", "message": "Error: no assistant text in response."}


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
    Stream LLM output as ``delta`` parts (token/segment chunks) and tool lifecycle events.

    Uses LangGraph ``astream_events`` (v2) with ``ChatOpenAI(streaming=True)`` so the wiki rail gets
    real-time model deltas. If the stream emits no text at all (rare), falls back to one
    ``ainvoke`` and yields a single ``delta`` with the final reply.
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
) -> tuple[str, dict[str, Any] | None]:
    """Run the agent on the current DB message history (last turn must be user).

    Returns (assistant visible text, tool_calls payload or None). Tool outputs are stored
    separately so the next turn can replay them into the model without re-running tools.
    """
    ctx = await _load_wiki_run_context(db, conversation, jwt_payload, use_streaming=False)
    if ctx.err or not ctx.agent:
        return ctx.err or "Error: agent failed to initialize.", None

    try:
        out = await ctx.agent.ainvoke({"messages": ctx.messages}, _agent_runnable_config())
    except GraphRecursionError as e:
        return _recursion_limit_exceeded_message() + f" ({e!s})", None
    traces = wiki_tool_traces_from_lc_messages(out.get("messages") or [])
    after = list(out.get("messages") or [])
    added = after[len(ctx.messages) :] if len(after) > len(ctx.messages) else []
    visible = _visible_assistant_text_from_added_messages(added)
    if not visible.strip():
        visible = _extract_assistant_text_from_ainvoke_out(out)
    if traces:
        return visible, {WIKI_TOOL_TRANSCRIPTS_KEY: traces}
    return visible, None


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
