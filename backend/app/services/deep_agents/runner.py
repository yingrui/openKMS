"""Run project workspace Deep Agent turns."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import AIMessage
from langgraph.errors import GraphRecursionError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_models import AgentConversation, AgentMessage
from app.services.agent.tool_transcripts import (
    AGENT_TOOL_TRANSCRIPTS_KEY,
    tool_payload_from_traces,
    tool_traces_from_tool_messages,
)
from app.services.deep_agents.factory import (
    ProjectAgentBuildContext,
    build_workspace_deep_agent,
    workspace_runnable_config,
)
from app.services.deep_agents.hitl import (
    ainvoke_with_scheduled_auto_resume,
    build_hitl_resume_payload,
    count_pending_hitl_decisions,
    interrupt_payload,
)
from app.services.deep_agents.observability import AgentTurnContext
from app.services.deep_agents.stream_accumulator import strip_leaked_compaction_text
from app.services.deep_agents.stream_events import ProjectStreamPart, iter_langgraph_stream_parts
from app.services.deep_agents.turn_prepare import prepare_workspace_turn_messages

logger = logging.getLogger(__name__)

# Backward-compatible alias for API layers that imported from runner.
PROJECT_TOOL_TRANSCRIPTS_KEY = AGENT_TOOL_TRANSCRIPTS_KEY


async def _conversation_message_rows(db: AsyncSession, conversation_id: str) -> list[AgentMessage]:
    result = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conversation_id)
        .order_by(AgentMessage.created_at, AgentMessage.id)
    )
    return list(result.scalars().all())


async def _pending_interrupt_parts(agent, cfg: dict) -> list[ProjectStreamPart]:
    snap = await agent.aget_state(cfg)
    return [{"type": "interrupt", "interrupt": interrupt_payload(intr.value)} for intr in snap.interrupts or ()]


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
    build_ctx = ProjectAgentBuildContext()
    agent, err = await build_workspace_deep_agent(
        db,
        project_id=project_id,
        project_name=project_name,
        project_slug=project_slug,
        project_description=project_description,
        project_settings=project_settings,
        bearer_token=bearer_token,
        plan_mode=plan_mode,
        build_ctx=build_ctx,
    )
    if err or not agent:
        msg = err or "Agent failed to initialize"
        if turn is not None:
            turn.log_failed(msg, conversation=conversation)
        yield {"type": "fatal", "message": msg}
        return
    cfg = workspace_runnable_config(
        conversation.id,
        session_id=session_id,
        streaming=True,
        plan_mode=plan_mode,
    )
    if build_ctx.llm is None or build_ctx.backend is None:
        msg = "Agent failed to initialize (missing LLM or workspace backend)"
        if turn is not None:
            turn.log_failed(msg, conversation=conversation)
        yield {"type": "fatal", "message": msg}
        return
    try:
        turn_messages = await prepare_workspace_turn_messages(
            agent,
            cfg,
            rows,
            llm=build_ctx.llm,
            backend=build_ctx.backend,
        )
    except Exception as e:
        msg = f"Context preparation failed: {e}"
        if turn is not None:
            turn.log_failed(msg, exc=e, conversation=conversation)
        yield {"type": "fatal", "message": msg}
        return
    any_text = False
    try:
        async for part in iter_langgraph_stream_parts(agent, {"messages": turn_messages}, cfg):
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
        msg = str(e)
        if turn is not None:
            turn.log_failed(msg, exc=e, conversation=conversation)
        yield {"type": "fatal", "message": msg}
        return
    interrupt_parts = await _pending_interrupt_parts(agent, cfg)
    for part in interrupt_parts:
        yield part
    if interrupt_parts:
        return
    if not any_text:
        try:
            out = await agent.ainvoke({"messages": turn_messages}, cfg)
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
        except Exception as e:
            msg = str(e)
            if turn is not None:
                turn.log_failed(msg, exc=e, conversation=conversation)
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
    build_ctx = ProjectAgentBuildContext()
    agent, err = await build_workspace_deep_agent(
        db,
        project_id=project_id,
        project_name=project_name,
        project_slug=project_slug,
        project_description=project_description,
        project_settings=project_settings,
        bearer_token=bearer_token,
        plan_mode=plan_mode,
        scheduled_run=scheduled_run,
        build_ctx=build_ctx,
    )
    if err or not agent:
        msg = err or "Agent failed to initialize"
        turn.log_failed(msg, conversation=conversation)
        return msg, None
    cfg = workspace_runnable_config(
        conversation.id,
        session_id=session_id,
        streaming=False,
        plan_mode=plan_mode,
    )
    if build_ctx.llm is None or build_ctx.backend is None:
        msg = "Agent failed to initialize (missing LLM or workspace backend)"
        turn.log_failed(msg, conversation=conversation)
        return msg, None
    try:
        turn_messages = await prepare_workspace_turn_messages(
            agent,
            cfg,
            rows,
            llm=build_ctx.llm,
            backend=build_ctx.backend,
        )
    except Exception as e:
        turn.log_failed(f"Context preparation failed: {e}", exc=e, conversation=conversation)
        return f"Context preparation failed: {e}", None
    try:
        if scheduled_run:
            out = await ainvoke_with_scheduled_auto_resume(
                agent, {"messages": turn_messages}, cfg
            )
        else:
            out = await agent.ainvoke({"messages": turn_messages}, cfg)
    except GraphRecursionError as e:
        msg = f"Recursion limit exceeded ({e!s})"
        turn.log_failed(msg, conversation=conversation)
        return msg, None
    except Exception as e:
        turn.log_failed(str(e), exc=e, conversation=conversation)
        return str(e), None
    traces = tool_traces_from_tool_messages(out.get("messages") or [])
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
    return visible, tool_payload_from_traces(traces)


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
    agent, err = await build_workspace_deep_agent(
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
    cfg = workspace_runnable_config(conversation.id, session_id=session_id, streaming=True)
    snap = await agent.aget_state(cfg)
    decision_count = count_pending_hitl_decisions(snap.interrupts)
    resume_payload = build_hitl_resume_payload(
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
