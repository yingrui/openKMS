"""Human-in-the-loop interrupt configuration for project agents."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

_MAX_SCHEDULED_HITL_ROUNDS = 20

# Project agents reach openKMS via installed skills (shell CLI), not built-in HTTP tools.
# Workspace file tools and shell run without approval; add tool names here if HITL is needed later.
DEFAULT_INTERRUPT_ON: dict[str, bool | dict[str, Any]] = {}


def interrupt_map(
    *,
    plan_mode: bool,
    scheduled_run: bool = False,
) -> dict[str, bool | dict[str, Any]] | None:
    if plan_mode or scheduled_run:
        return None
    return dict(DEFAULT_INTERRUPT_ON) or None


def interrupt_payload(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {"value": value}


def count_pending_hitl_decisions(interrupts: tuple[Any, ...] | list[Any] | None) -> int:
    """How many approve/reject decisions LangGraph expects on the next resume."""
    total = 0
    for intr in interrupts or ():
        payload = interrupt_payload(getattr(intr, "value", intr))
        nested = payload.get("value")
        if isinstance(nested, dict) and "action_requests" in nested:
            payload = nested
        reqs = payload.get("action_requests")
        if isinstance(reqs, list) and reqs:
            total += len(reqs)
        else:
            total += 1
    return total or 1


def build_hitl_resume_payload(
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


async def ainvoke_with_scheduled_auto_resume(agent, payload: Any, cfg: dict) -> dict:
    """Run agent turn and auto-approve any HITL interrupts (scheduled runs only)."""
    from langgraph.types import Command

    out = await agent.ainvoke(payload, cfg)
    for round_idx in range(_MAX_SCHEDULED_HITL_ROUNDS):
        snap = await agent.aget_state(cfg)
        if not snap.interrupts:
            return out
        count = count_pending_hitl_decisions(snap.interrupts)
        resume_payload = build_hitl_resume_payload(decision="approve", count=count)
        out = await agent.ainvoke(Command(resume=resume_payload), cfg)
        logger.info("Scheduled run auto-approved HITL interrupt (round %s)", round_idx + 1)
    snap = await agent.aget_state(cfg)
    if snap.interrupts:
        logger.warning(
            "Scheduled run still has pending interrupts after %s auto-resume rounds",
            _MAX_SCHEDULED_HITL_ROUNDS,
        )
    return out
