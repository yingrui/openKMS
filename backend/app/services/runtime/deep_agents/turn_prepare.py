"""Shared pre-turn setup: compaction + checkpoint-first message input."""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import BaseMessage
from langgraph.types import Overwrite

from app.models.agent_models import AgentMessage
from app.services.runtime.deep_agents.context_compaction import compact_project_context_if_needed
from app.services.runtime.deep_agents.tool_call_repair import repair_tool_call_pairing
from app.services.runtime.deep_agents.turn_input import resolve_turn_input_messages

logger = logging.getLogger(__name__)


async def prepare_workspace_turn_messages(
    agent: Any,
    cfg: dict[str, Any],
    db_rows: list[AgentMessage],
    *,
    llm: Any,
    backend: Any,
) -> list[BaseMessage]:
    """Compact checkpoint if over budget, repair pairing, then resolve messages for the graph."""
    await compact_project_context_if_needed(agent, cfg, llm=llm, backend=backend)
    await repair_checkpoint_pairing(agent, cfg)
    return await resolve_turn_input_messages(agent, cfg, db_rows)


async def repair_checkpoint_pairing(agent: Any, cfg: dict[str, Any]) -> int:
    """Fix tool-call pairing **in the checkpoint**, not just in this request's input.

    Doing it only on the outgoing message list would leave the thread broken, so every later
    turn pays the same repair — and compaction, which slices by index, would keep slicing
    around a hole. Writing the repair back makes the thread valid once.

    A turn killed mid-tool is the usual cause: the assistant message that requested the tool is
    persisted, the result is not.
    """
    snap = await agent.aget_state(cfg)
    state = dict(snap.values or {})
    messages = list(state.get("messages") or [])
    if not messages:
        return 0
    repaired_messages, repaired = repair_tool_call_pairing(messages)
    # The repair also *reorders* tool results that were separated from their request (e.g. by
    # the budget warning), which inserts no placeholder — persist whenever the list changed.
    if not repaired and repaired_messages == messages:
        return 0
    logger.info(
        "Persisting tool-call repair on the checkpoint thread (%s placeholder(s), %s message(s))",
        repaired,
        len(repaired_messages) - len(messages),
    )
    # `Overwrite` replaces the channel; a plain list would be merged by `add_messages`, which
    # keeps the original order (and so cannot move a tool result back next to its request).
    await agent.aupdate_state(cfg, {"messages": Overwrite(repaired_messages)})
    return repaired
