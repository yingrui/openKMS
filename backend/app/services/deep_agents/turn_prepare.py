"""Shared pre-turn setup: compaction + checkpoint-first message input."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import BaseMessage

from app.models.agent_models import AgentMessage
from app.services.deep_agents.context_compaction import compact_project_context_if_needed
from app.services.deep_agents.turn_input import resolve_turn_input_messages


async def prepare_workspace_turn_messages(
    agent: Any,
    cfg: dict[str, Any],
    db_rows: list[AgentMessage],
    *,
    llm: Any,
    backend: Any,
) -> list[BaseMessage]:
    """Compact checkpoint if over budget, then resolve messages to pass to the graph."""
    await compact_project_context_if_needed(agent, cfg, llm=llm, backend=backend)
    return await resolve_turn_input_messages(agent, cfg, db_rows)
