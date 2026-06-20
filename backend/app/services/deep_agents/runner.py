"""Run project workspace Deep Agent turns."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from deepagents import create_deep_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.errors import GraphRecursionError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.agent_models import AgentConversation, AgentMessage
from app.services.agent.llm import resolve_agent_llm_config
from app.services.agent.wiki_runner import (
    WIKI_TOOL_TRANSCRIPTS_KEY,
    assistant_lc_content_from_db_row,
    truncate_wiki_tool_output_for_storage,
)
from app.services.deep_agents.context_compaction import compact_project_context_if_needed
from app.services.deep_agents.checkpointer import get_checkpointer
from app.services.deep_agents.env import build_project_shell_env
from app.services.deep_agents.hitl import interrupt_map
from app.services.deep_agents.langfuse import build_deep_agent_langgraph_config
from app.services.deep_agents.observability import AgentTurnContext
from app.services.deep_agents.plan_mode import plan_mode_permissions
from app.services.deep_agents.project_backend import ProjectWorkspaceBackend
from app.services.deep_agents.prompts import build_project_system_prompt
from app.services.deep_agents.sandbox import make_sandbox_tools
from app.services.deep_agents.skills.loader import list_skill_paths
from app.services.deep_agents.stream_accumulator import strip_leaked_compaction_text
from app.services.deep_agents.stream_events import ProjectStreamPart, iter_langgraph_stream_parts
from app.services.deep_agents.subagents.profiles import build_subagents
from app.services.deep_agents.tools.web_search import make_web_search_tools
from app.services.project_fs import project_root

logger = logging.getLogger(__name__)

# Reuse wiki storage key for tool trace replay in history.
PROJECT_TOOL_TRANSCRIPTS_KEY = WIKI_TOOL_TRANSCRIPTS_KEY

_MAX_SCHEDULED_HITL_ROUNDS = 20


def new_id() -> str:
    return str(uuid4())


def _normalize_openai_base_url(url: str) -> str:
    b = (url or "").rstrip("/")
    return b if b.endswith("/v1") else f"{b}/v1"


def _settings_flag_on(value: Any) -> bool:
    return value in (True, "true", "True", 1, "1")


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
    project_name: str,
    project_slug: str,
    project_description: str | None,
    project_settings: dict,
    bearer_token: str,
    plan_mode: bool,
    scheduled_run: bool = False,
    build_ctx: dict[str, Any] | None = None,
):
    llm = await _build_llm(db, streaming=True)
    if not llm:
        return None, "No LLM configured for agents"
    root = str(project_root(project_id))
    shell_env = build_project_shell_env(project_id, bearer_token, project_settings)
    backend = ProjectWorkspaceBackend(
        root_dir=root,
        virtual_mode=True,
        inherit_env=True,
        env=shell_env,
        timeout=settings.agent_sandbox_timeout_seconds,
    )
    if build_ctx is not None:
        build_ctx["llm"] = llm
        build_ctx["backend"] = backend
    tools: list = []
    if not plan_mode:
        tools.extend(make_sandbox_tools(project_id, shell_env=shell_env))
    connector_id = str(project_settings.get("search_connector_id") or "").strip()
    if _settings_flag_on(project_settings.get("web_search")) and connector_id:
        tools.extend(await make_web_search_tools(db, connector_id))
    skills = list_skill_paths(project_id)
    checkpointer = await get_checkpointer()
    try:
        agent = create_deep_agent(
            model=llm,
            tools=tools,
            system_prompt=build_project_system_prompt(
                project_id,
                project_name=project_name,
                project_slug=project_slug,
                project_description=project_description,
                installed_skills=project_settings.get("installed_skills"),
                plan_mode=plan_mode,
                scheduled_run=scheduled_run,
            ),
            subagents=build_subagents(plan_mode=plan_mode, include_shell=not plan_mode),
            skills=skills or None,
            backend=backend,
            permissions=plan_mode_permissions() if plan_mode else None,
            interrupt_on=interrupt_map(plan_mode=plan_mode, scheduled_run=scheduled_run),
            checkpointer=checkpointer,
        )
    except Exception as e:
        logger.exception("create_deep_agent failed for project %s", project_id)
        return None, str(e)
    return agent, None


def _runnable_config(
    conversation_id: str,
    *,
    thread_id: str | None = None,
    session_id: str | None = None,
    streaming: bool = False,
    plan_mode: bool = False,
) -> dict:
    return build_deep_agent_langgraph_config(
        conversation_id=conversation_id,
        session_id=session_id,
        streaming=streaming,
        plan_mode=plan_mode,
        thread_id=thread_id,
    )


def _interrupt_payload(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {"value": value}


def _count_pending_hitl_decisions(interrupts: tuple[Any, ...] | list[Any] | None) -> int:
    """How many approve/reject decisions LangGraph expects on the next resume."""
    total = 0
    for intr in interrupts or ():
        payload = _interrupt_payload(getattr(intr, "value", intr))
        nested = payload.get("value")
        if isinstance(nested, dict) and "action_requests" in nested:
            payload = nested
        reqs = payload.get("action_requests")
        if isinstance(reqs, list) and reqs:
            total += len(reqs)
        else:
            total += 1
    return total or 1


def _build_hitl_resume_payload(
    *,
    decision: str,
    count: int,
    edited_args: dict | None = None,
    message: str | None = None,
) -> dict[str, Any]:
    decisions: list[dict[str, Any]] = []
    for i in range(count):
        entry: dict[str, Any] = {"type": decision}
        if i == 0 and edited_args is not None:
            entry["edited_action"] = edited_args
        if message and decision in ("reject", "respond"):
            entry["message"] = message
        decisions.append(entry)
    return {"decisions": decisions}


async def _ainvoke_with_scheduled_auto_resume(agent, payload: Any, cfg: dict) -> dict:
    """Run agent turn and auto-approve any HITL interrupts (scheduled runs only)."""
    from langgraph.types import Command

    out = await agent.ainvoke(payload, cfg)
    for round_idx in range(_MAX_SCHEDULED_HITL_ROUNDS):
        snap = await agent.aget_state(cfg)
        if not snap.interrupts:
            return out
        count = _count_pending_hitl_decisions(snap.interrupts)
        resume_payload = _build_hitl_resume_payload(decision="approve", count=count)
        out = await agent.ainvoke(Command(resume=resume_payload), cfg)
        logger.info("Scheduled run auto-approved HITL interrupt (round %s)", round_idx + 1)
    snap = await agent.aget_state(cfg)
    if snap.interrupts:
        logger.warning(
            "Scheduled run still has pending interrupts after %s auto-resume rounds",
            _MAX_SCHEDULED_HITL_ROUNDS,
        )
    return out


async def _pending_interrupt_parts(agent, cfg: dict) -> list[ProjectStreamPart]:
    snap = await agent.aget_state(cfg)
    return [{"type": "interrupt", "interrupt": _interrupt_payload(intr.value)} for intr in snap.interrupts or ()]


async def _conversation_message_rows(db: AsyncSession, conversation_id: str) -> list[AgentMessage]:
    result = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conversation_id)
        .order_by(AgentMessage.created_at, AgentMessage.id)
    )
    return list(result.scalars().all())


async def iter_project_stream_parts(
    db: AsyncSession,
    conversation: AgentConversation,
    jwt_payload: dict[str, Any],
    bearer_token: str,
    project_id: str,
    project_name: str,
    project_slug: str,
    project_description: str | None,
    project_settings: dict,
    *,
    plan_mode: bool = False,
    session_id: str | None = None,
    turn: AgentTurnContext | None = None,
) -> AsyncIterator[ProjectStreamPart]:
    del jwt_payload
    rows = await _conversation_message_rows(db, conversation.id)
    messages = _lc_messages_from_db(rows)
    agent, err = await _build_agent(
        db,
        project_id=project_id,
        project_name=project_name,
        project_slug=project_slug,
        project_description=project_description,
        project_settings=project_settings,
        bearer_token=bearer_token,
        plan_mode=plan_mode,
    )
    if err or not agent:
        msg = err or "Agent failed to initialize"
        if turn is not None:
            turn.log_failed(msg, conversation=conversation)
        yield {"type": "fatal", "message": msg}
        return
    cfg = _runnable_config(
        conversation.id,
        session_id=session_id,
        streaming=True,
        plan_mode=plan_mode,
    )
    any_text = False
    try:
        async for part in iter_langgraph_stream_parts(agent, {"messages": messages}, cfg):
            if part.get("type") == "delta":
                any_text = True
            yield part
    except GraphRecursionError as e:
        msg = f"Recursion limit exceeded ({e!s})"
        if turn is not None:
            turn.log_failed(msg, conversation=conversation)
        yield {"type": "fatal", "message": msg}
        return
    except Exception as e:
        if turn is not None:
            turn.log_failed(str(e), exc=e, conversation=conversation)
        raise
    interrupt_parts = await _pending_interrupt_parts(agent, cfg)
    for part in interrupt_parts:
        yield part
    if interrupt_parts:
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
            msg = f"Recursion limit exceeded ({e!s})"
            if turn is not None:
                turn.log_failed(msg, conversation=conversation)
            yield {"type": "fatal", "message": msg}


async def run_project_turn(
    db: AsyncSession,
    conversation: AgentConversation,
    jwt_payload: dict[str, Any],
    bearer_token: str,
    project_id: str,
    project_name: str,
    project_slug: str,
    project_description: str | None,
    project_settings: dict,
    *,
    plan_mode: bool = False,
    session_id: str | None = None,
    scheduled_run: bool = False,
) -> tuple[str, dict[str, Any] | None]:
    del jwt_payload
    turn = AgentTurnContext.start(
        project_id=project_id,
        conversation_id=conversation.id,
        plan_mode=plan_mode,
        scheduled_run=scheduled_run,
        streaming=False,
    )
    rows = await _conversation_message_rows(db, conversation.id)
    messages = _lc_messages_from_db(rows)
    build_ctx: dict[str, Any] = {}
    agent, err = await _build_agent(
        db,
        project_id=project_id,
        project_name=project_name,
        project_slug=project_slug,
        project_description=project_description,
        project_settings=project_settings,
        bearer_token=bearer_token,
        plan_mode=plan_mode,
        scheduled_run=scheduled_run,
        build_ctx=build_ctx if scheduled_run else None,
    )
    if err or not agent:
        msg = err or "Agent failed to initialize"
        turn.log_failed(msg, conversation=conversation)
        return msg, None
    cfg = _runnable_config(
        conversation.id,
        session_id=session_id,
        streaming=False,
        plan_mode=plan_mode,
    )
    try:
        if scheduled_run:
            llm = build_ctx.get("llm")
            backend = build_ctx.get("backend")
            if llm is not None and backend is not None:
                try:
                    await compact_project_context_if_needed(
                        agent, cfg, llm=llm, backend=backend
                    )
                except Exception as e:
                    turn.log_failed(f"Context compaction failed: {e}", exc=e, conversation=conversation)
                    return f"Context compaction failed: {e}", None
            out = await _ainvoke_with_scheduled_auto_resume(
                agent, {"messages": messages}, cfg
            )
        else:
            out = await agent.ainvoke({"messages": messages}, cfg)
    except GraphRecursionError as e:
        msg = f"Recursion limit exceeded ({e!s})"
        turn.log_failed(msg, conversation=conversation)
        return msg, None
    except Exception as e:
        turn.log_failed(str(e), exc=e, conversation=conversation)
        raise
    traces = _tool_traces_from_messages(out.get("messages") or [])
    after = list(out.get("messages") or [])
    visible = ""
    if after:
        last = after[-1]
        if isinstance(last, AIMessage) and last.content:
            visible = last.content if isinstance(last.content, str) else str(last.content)
            visible = strip_leaked_compaction_text(visible)
    lower = (visible or "").lower()
    if not traces and (
        "failed to initialize" in lower or "recursion limit" in lower
    ):
        turn.log_failed(visible or "Scheduled agent run failed", conversation=conversation)
        return visible or "Scheduled agent run failed", None
    turn.log_done(
        tool_count=len(traces),
        assistant_chars=len(visible),
        conversation=conversation,
    )
    if traces:
        return visible, {PROJECT_TOOL_TRANSCRIPTS_KEY: traces}
    return visible, None


async def resume_project_interrupt(
    db: AsyncSession,
    conversation: AgentConversation,
    project_id: str,
    project_name: str,
    project_slug: str,
    project_description: str | None,
    project_settings: dict,
    jwt_payload: dict[str, Any],
    bearer_token: str,
    *,
    decision: str,
    edited_args: dict | None = None,
    message: str | None = None,
    session_id: str | None = None,
    turn: AgentTurnContext | None = None,
) -> AsyncIterator[ProjectStreamPart]:
    from langgraph.types import Command

    del jwt_payload
    agent, err = await _build_agent(
        db,
        project_id=project_id,
        project_name=project_name,
        project_slug=project_slug,
        project_description=project_description,
        project_settings=project_settings,
        bearer_token=bearer_token,
        plan_mode=False,
    )
    if err or not agent:
        msg = err or "Agent failed to initialize"
        if turn is not None:
            turn.log_failed(msg, conversation=conversation)
        yield {"type": "fatal", "message": msg}
        return
    cfg = _runnable_config(conversation.id, session_id=session_id, streaming=True)
    snap = await agent.aget_state(cfg)
    decision_count = _count_pending_hitl_decisions(snap.interrupts)
    resume_payload = _build_hitl_resume_payload(
        decision=decision,
        count=decision_count,
        edited_args=edited_args,
        message=message,
    )
    try:
        async for part in iter_langgraph_stream_parts(agent, Command(resume=resume_payload), cfg):
            yield part
        interrupt_parts = await _pending_interrupt_parts(agent, cfg)
        for part in interrupt_parts:
            yield part
    except GraphRecursionError as e:
        msg = f"Recursion limit exceeded ({e!s})"
        if turn is not None:
            turn.log_failed(msg, conversation=conversation)
        yield {"type": "fatal", "message": msg}
    except Exception as e:
        if turn is not None:
            turn.log_failed(str(e), exc=e, conversation=conversation)
        else:
            logger.exception("resume_project_interrupt failed for conversation %s", conversation.id)
        yield {"type": "fatal", "message": str(e)}
