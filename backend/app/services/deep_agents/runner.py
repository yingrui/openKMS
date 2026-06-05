"""Run project workspace Deep Agent turns."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any, Literal, TypedDict
from urllib.parse import urlparse
from uuid import uuid4

from deepagents import create_deep_agent
from deepagents.backends.filesystem import FilesystemBackend
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage, HumanMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.errors import GraphRecursionError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.agent_models import AgentConversation, AgentMessage
from app.services.agent.llm import resolve_agent_llm_config
from app.services.agent.wiki_runner import (
    WIKI_TOOL_TRANSCRIPTS_KEY,
    assistant_lc_content_from_db_row,
    truncate_wiki_tool_output_for_storage,
)

# Reuse wiki storage key for tool trace replay in history.
PROJECT_TOOL_TRANSCRIPTS_KEY = WIKI_TOOL_TRANSCRIPTS_KEY
from app.services.deep_agents.checkpointer import get_checkpointer
from app.services.deep_agents.hitl import interrupt_map
from app.services.deep_agents.plan_mode import plan_mode_permissions
from app.services.deep_agents.prompts import build_project_system_prompt
from app.services.deep_agents.skills.loader import list_skill_paths
from app.services.deep_agents.subagents.profiles import build_subagents
from app.services.deep_agents.tools.git_local import make_git_tools
from app.services.deep_agents.tools.openkms import make_openkms_tools
from app.services.deep_agents.tools.web_search import make_web_search_tools
from app.services.deep_agents.sandbox import make_sandbox_tools
from app.services.project_fs import project_root

logger = logging.getLogger(__name__)

def new_id() -> str:
    return str(uuid4())


def _normalize_openai_base_url(url: str) -> str:
    b = (url or "").rstrip("/")
    return b if b.endswith("/v1") else f"{b}/v1"


def _lc_messages_from_db(rows: list[AgentMessage]) -> list[BaseMessage]:
    out: list[BaseMessage] = []
    for m in rows:
        if m.role == "user":
            out.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            out.append(AIMessage(content=assistant_lc_content_from_db_row(m.content, m.tool_calls)))
    return out


def _tool_traces_from_messages(messages: list[Any]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for m in messages:
        if not isinstance(m, ToolMessage):
            continue
        name = getattr(m, "name", None) or "tool"
        raw = m.content
        body = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False, default=str)
        out.append({"name": name, "output": truncate_wiki_tool_output_for_storage(body)})
    return out


def _message_to_stream_text_raw(chunk: Any) -> str:
    if chunk is None:
        return ""
    if isinstance(chunk, AIMessageChunk):
        c = chunk.content
        if isinstance(c, str):
            return c
        if isinstance(c, list):
            parts: list[str] = []
            for b in c:
                if isinstance(b, str):
                    parts.append(b)
                elif isinstance(b, dict) and b.get("type") == "text":
                    parts.append(str(b.get("text") or ""))
            return "".join(parts)
    if hasattr(chunk, "content"):
        c = getattr(chunk, "content", "")
        return c if isinstance(c, str) else ""
    return ""


def _tool_io_preview(x: Any, max_len: int) -> str:
    if x is None:
        return ""
    try:
        s = x if isinstance(x, str) else json.dumps(x, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        s = str(x)
    return s[: max_len - 18] + "…[truncated]" if len(s) > max_len else s


class ProjectStreamPart(TypedDict, total=False):
    type: Literal["delta", "tool_start", "tool_end", "tool_error", "todo", "interrupt", "subagent_start", "subagent_end", "fatal"]
    t: str
    run_id: str
    name: str
    input: str
    output: str
    error: str
    message: str
    todos: list
    interrupt: dict


async def _build_llm(db: AsyncSession, *, streaming: bool) -> ChatOpenAI | None:
    cfg = await resolve_agent_llm_config(db, model_id=settings.deep_agent_model_id)
    if not cfg or not cfg.get("base_url"):
        return None
    return ChatOpenAI(
        base_url=_normalize_openai_base_url(cfg["base_url"]),
        api_key=cfg.get("api_key") or "not-needed",
        model=cfg.get("model_name") or "gpt-4o-mini",
        max_tokens=settings.agent_max_output_tokens,
        streaming=streaming,
        temperature=0.2,
    )


async def _build_agent(
    db: AsyncSession,
    *,
    project_id: str,
    project_settings: dict,
    jwt_payload: dict[str, Any],
    bearer_token: str,
    plan_mode: bool,
):
    llm = await _build_llm(db, streaming=True)
    if not llm:
        return None, "No LLM configured for agents"
    root = str(project_root(project_id))
    backend = FilesystemBackend(root_dir=root, virtual_mode=True)
    perms = jwt_payload.get("realm_access", {}).get("roles", [])
    if isinstance(perms, list):
        perm_set = set(perms)
    else:
        perm_set = set()
    if jwt_payload.get("openkms_auth_via") == "api_key":
        perm_set = set(jwt_payload.get("permissions") or [])
    tools: list = []
    if not plan_mode:
        tools.extend(make_sandbox_tools(project_id))
        tools.extend(make_git_tools(project_id, project_settings))
    tools.extend(make_openkms_tools(bearer_token, perm_set))
    tools.extend(make_web_search_tools())
    skills = list_skill_paths(project_id)
    checkpointer = await get_checkpointer()
    try:
        agent = create_deep_agent(
            model=llm,
            tools=tools,
            system_prompt=build_project_system_prompt(project_id, plan_mode=plan_mode),
            subagents=build_subagents(plan_mode=plan_mode, include_shell=not plan_mode),
            skills=skills or None,
            backend=backend,
            permissions=plan_mode_permissions() if plan_mode else None,
            interrupt_on=interrupt_map(plan_mode=plan_mode),
            checkpointer=checkpointer,
        )
    except Exception as e:
        logger.exception("create_deep_agent failed for project %s", project_id)
        return None, str(e)
    return agent, None


def _runnable_config(conversation_id: str, *, thread_id: str | None = None) -> dict:
    return {
        "configurable": {"thread_id": thread_id or conversation_id},
        "recursion_limit": settings.agent_recursion_limit,
    }


async def iter_project_stream_parts(
    db: AsyncSession,
    conversation: AgentConversation,
    jwt_payload: dict[str, Any],
    bearer_token: str,
    project_id: str,
    project_settings: dict,
    *,
    plan_mode: bool = False,
) -> AsyncIterator[ProjectStreamPart]:
    rows = list(conversation.messages)
    rows.sort(key=lambda m: (m.created_at, m.id))
    messages = _lc_messages_from_db(rows)
    agent, err = await _build_agent(
        db,
        project_id=project_id,
        project_settings=project_settings,
        jwt_payload=jwt_payload,
        bearer_token=bearer_token,
        plan_mode=plan_mode,
    )
    if err or not agent:
        yield {"type": "fatal", "message": err or "Agent failed to initialize"}
        return
    cfg = _runnable_config(conversation.id)
    any_text = False
    try:
        async for ev in agent.astream_events({"messages": messages}, cfg, version="v2"):
            ename = (ev.get("event") or "") if isinstance(ev, dict) else ""
            if ename == "on_chat_model_stream":
                ch = (ev.get("data") or {}).get("chunk")
                t = _message_to_stream_text_raw(ch)
                if t:
                    any_text = True
                    yield {"type": "delta", "t": t}
            elif ename == "on_tool_start":
                name = (ev.get("name") or "tool").split("/")[-1]
                if name == "write_todos":
                    inp = (ev.get("data") or {}).get("input")
                    if isinstance(inp, dict) and inp.get("todos"):
                        yield {"type": "todo", "todos": inp["todos"]}
                if name == "task":
                    yield {"type": "subagent_start", "name": str((ev.get("data") or {}).get("input", ""))[:200]}
                run_id = str(ev.get("run_id") or "")
                yield {
                    "type": "tool_start",
                    "run_id": run_id,
                    "name": name,
                    "input": _tool_io_preview((ev.get("data") or {}).get("input"), 6000),
                }
            elif ename == "on_tool_end":
                name = (ev.get("name") or "tool").split("/")[-1]
                if name == "task":
                    yield {"type": "subagent_end", "name": name}
                run_id = str(ev.get("run_id") or "")
                yield {
                    "type": "tool_end",
                    "run_id": run_id,
                    "name": name,
                    "output": _tool_io_preview((ev.get("data") or {}).get("output"), 10000),
                }
            elif ename == "on_tool_error":
                run_id = str(ev.get("run_id") or "")
                name = (ev.get("name") or "tool").split("/")[-1]
                err_obj = (ev.get("data") or {}).get("error")
                yield {
                    "type": "tool_error",
                    "run_id": run_id,
                    "name": name,
                    "error": _tool_io_preview(str(err_obj), 2000),
                }
    except GraphRecursionError as e:
        yield {"type": "fatal", "message": f"Recursion limit exceeded ({e!s})"}
        return
    if not any_text:
        try:
            out = await agent.ainvoke({"messages": messages}, cfg)
            msgs = out.get("messages") or []
            if msgs:
                last = msgs[-1]
                if isinstance(last, AIMessage) and last.content:
                    text = last.content if isinstance(last.content, str) else str(last.content)
                    yield {"type": "delta", "t": text}
        except GraphRecursionError as e:
            yield {"type": "fatal", "message": f"Recursion limit exceeded ({e!s})"}


async def run_project_turn(
    db: AsyncSession,
    conversation: AgentConversation,
    jwt_payload: dict[str, Any],
    bearer_token: str,
    project_id: str,
    project_settings: dict,
    *,
    plan_mode: bool = False,
) -> tuple[str, dict[str, Any] | None]:
    rows = list(conversation.messages)
    rows.sort(key=lambda m: (m.created_at, m.id))
    messages = _lc_messages_from_db(rows)
    agent, err = await _build_agent(
        db,
        project_id=project_id,
        project_settings=project_settings,
        jwt_payload=jwt_payload,
        bearer_token=bearer_token,
        plan_mode=plan_mode,
    )
    if err or not agent:
        return err or "Agent failed to initialize", None
    cfg = _runnable_config(conversation.id)
    try:
        out = await agent.ainvoke({"messages": messages}, cfg)
    except GraphRecursionError as e:
        return f"Recursion limit exceeded ({e!s})", None
    traces = _tool_traces_from_messages(out.get("messages") or [])
    after = list(out.get("messages") or [])
    visible = ""
    if after:
        last = after[-1]
        if isinstance(last, AIMessage) and last.content:
            visible = last.content if isinstance(last.content, str) else str(last.content)
    if traces:
        return visible, {PROJECT_TOOL_TRANSCRIPTS_KEY: traces}
    return visible, None


async def resume_project_interrupt(
    db: AsyncSession,
    conversation: AgentConversation,
    project_id: str,
    project_settings: dict,
    jwt_payload: dict[str, Any],
    bearer_token: str,
    *,
    decision: str,
    edited_args: dict | None = None,
    message: str | None = None,
) -> AsyncIterator[ProjectStreamPart]:
    from langgraph.types import Command

    agent, err = await _build_agent(
        db,
        project_id=project_id,
        project_settings=project_settings,
        jwt_payload=jwt_payload,
        bearer_token=bearer_token,
        plan_mode=False,
    )
    if err or not agent:
        yield {"type": "fatal", "message": err or "Agent failed to initialize"}
        return
    cfg = _runnable_config(conversation.id)
    resume_payload: dict[str, Any] = {"decisions": [{"type": decision}]}
    if edited_args is not None:
        resume_payload["decisions"][0]["edited_action"] = edited_args
    if message:
        resume_payload["decisions"][0]["message"] = message
    try:
        async for ev in agent.astream_events(Command(resume=resume_payload), cfg, version="v2"):
            ename = ev.get("event") or ""
            if ename == "on_chat_model_stream":
                t = _message_to_stream_text_raw((ev.get("data") or {}).get("chunk"))
                if t:
                    yield {"type": "delta", "t": t}
    except Exception as e:
        yield {"type": "fatal", "message": str(e)}
