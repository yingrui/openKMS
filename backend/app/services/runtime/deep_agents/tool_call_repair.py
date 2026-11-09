"""Repair tool-call pairing in a checkpoint thread before a turn is sent to the model.

Providers reject a conversation where an assistant message carries `tool_calls` but no
`tool` message answers each `tool_call_id`:

    400 An assistant message with 'tool_calls' must be followed by tool messages responding
        to each 'tool_call_id'. (insufficient tool messages following tool_calls message)

That state is produced by us, not by the model: a turn killed mid-tool (a crash, a restart, a
`SIGKILL`ed backend) persists the assistant message that *requested* the tool but never the
result. Compaction compounds it — `cutoff_index` can land between the pair.

The repair **adds a synthetic tool message** for each unanswered call instead of deleting
history. Deleting the assistant message would drop the model's own reasoning about what it was
doing; an explicit "interrupted, no result" tool message keeps the transcript truthful and
satisfies the provider's pairing rule.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage

logger = logging.getLogger(__name__)

INTERRUPTED_TOOL_CONTENT = (
    "Tool call did not complete — the run was interrupted before a result was recorded. "
    "Re-run it if the result is still needed."
)


def _tool_call_ids(message: BaseMessage) -> list[str]:
    """`tool_call_id`s an assistant message requested (empty for anything else)."""
    if not isinstance(message, AIMessage):
        return []
    raw = getattr(message, "tool_calls", None) or []
    out: list[str] = []
    for call in raw:
        if isinstance(call, dict):
            cid = call.get("id")
        else:
            cid = getattr(call, "id", None)
        if isinstance(cid, str) and cid:
            out.append(cid)
    return out


def repair_tool_call_pairing(messages: list[BaseMessage]) -> tuple[list[BaseMessage], int]:
    """Insert a placeholder `ToolMessage` for every tool call left unanswered.

    Returns `(messages, repaired)` where `repaired` counts the messages inserted, so callers can
    log — a non-zero count means a previous turn died mid-tool, which is worth knowing.
    """
    if not messages:
        return messages, 0

    # Which tool_call_ids already have a response anywhere in the thread. A response may sit
    # after another assistant message in an interleaved transcript, so collect globally.
    answered: set[str] = {
        m.tool_call_id
        for m in messages
        if isinstance(m, ToolMessage) and isinstance(m.tool_call_id, str) and m.tool_call_id
    }

    out: list[BaseMessage] = []
    repaired = 0
    for message in messages:
        out.append(message)
        for call_id in _tool_call_ids(message):
            if call_id in answered:
                continue
            out.append(
                ToolMessage(
                    content=INTERRUPTED_TOOL_CONTENT,
                    tool_call_id=call_id,
                    name="interrupted",
                    status="error",
                )
            )
            answered.add(call_id)
            repaired += 1

    if repaired:
        logger.warning(
            "Repaired %s unanswered tool call(s) in a %s-message thread "
            "(a previous turn was interrupted mid-tool)",
            repaired,
            len(messages),
        )
    elif _has_unanswered_tail(messages):
        # Defensive: the global pass above is authoritative, so reaching here means the
        # accounting is wrong. Loud, because the next request would fail with a 400.
        logger.error("Tool-call pairing repair reported no work but the thread still looks broken")

    return out, repaired


def _has_unanswered_tail(messages: list[BaseMessage]) -> bool:
    """True when the last assistant message's calls have no response after it."""
    last_ai = next(
        (m for m in reversed(messages) if isinstance(m, AIMessage)),
        None,
    )
    if last_ai is None:
        return False
    requested = set(_tool_call_ids(last_ai))
    if not requested:
        return False
    after = messages[messages.index(last_ai) + 1 :]
    answered = {m.tool_call_id for m in after if isinstance(m, ToolMessage)}
    return bool(requested - answered)


def assert_tool_call_pairing(messages: list[BaseMessage]) -> None:
    """Guard for tests: every requested call id has a response."""
    answered = {m.tool_call_id for m in messages if isinstance(m, ToolMessage)}
    for message in messages:
        missing = set(_tool_call_ids(message)) - answered
        if missing:
            raise AssertionError(f"unanswered tool_calls: {sorted(missing)}")


def summarize_unpaired(messages: list[BaseMessage]) -> list[str]:
    """Debug helper: ids that appear in `tool_calls` but never in a tool response."""
    answered = {m.tool_call_id for m in messages if isinstance(m, ToolMessage)}
    return [cid for m in messages for cid in _tool_call_ids(m) if cid not in answered]


__all__: list[Any] = [
    "INTERRUPTED_TOOL_CONTENT",
    "assert_tool_call_pairing",
    "repair_tool_call_pairing",
    "summarize_unpaired",
]
