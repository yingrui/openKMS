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
    """Make every assistant `tool_calls` block valid for the provider.

    Two defects are repaired, both produced by us rather than by the model:

    * **unanswered** — the turn died between the request and its result (crash, restart, a
      killed backend). A placeholder tool message is inserted.
    * **interleaved** — another message (e.g. the budget warning's `SystemMessage`) landed
      between the request and its result, or a result was persisted after a later turn. The
      provider requires the `tool` messages to *immediately* follow, so each result is moved
      back next to its request. This is why `N` calls can all be "answered" and the request
      still fails with `insufficient tool messages following tool_calls message`.

    Orphan tool messages (no request) and duplicate responses are dropped: the API rejects
    both. Returns `(messages, repaired)` where `repaired` counts placeholders inserted.
    """
    if not messages:
        return messages, 0

    responses: dict[str, ToolMessage] = {}
    for message in messages:
        if isinstance(message, ToolMessage) and isinstance(message.tool_call_id, str) and message.tool_call_id:
            responses[message.tool_call_id] = message  # last wins; duplicates are invalid

    requested: set[str] = set()
    body = [m for m in messages if not isinstance(m, ToolMessage)]
    out: list[BaseMessage] = []
    repaired = 0
    for message in body:
        out.append(message)
        call_ids = _tool_call_ids(message)
        if not call_ids:
            continue
        requested.update(call_ids)
        for call_id in call_ids:
            response = responses.get(call_id)
            if response is None:
                response = ToolMessage(
                    content=INTERRUPTED_TOOL_CONTENT,
                    tool_call_id=call_id,
                    name="interrupted",
                    status="error",
                )
                repaired += 1
            out.append(response)

    if repaired:
        logger.warning(
            "Repaired %s unanswered tool call(s) in a %s-message thread "
            "(a previous turn was interrupted mid-tool)",
            repaired,
            len(messages),
        )
    moved = len(out) - len(body) - len(requested)
    if moved:
        logger.info(
            "Reordered %s tool message(s) to sit directly after their request (%s-message thread)",
            moved,
            len(messages),
        )
    orphaned = set(responses) - requested
    if orphaned:
        logger.warning("Dropped %s orphan tool message(s): %s", len(orphaned), sorted(orphaned)[:5])

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
    """Guard for tests: every request is answered *immediately* by its tool messages."""
    for index, message in enumerate(messages):
        requested = _tool_call_ids(message)
        if not requested:
            continue
        following: list[str] = []
        cursor = index + 1
        while cursor < len(messages) and isinstance(messages[cursor], ToolMessage):
            tool_call_id = messages[cursor].tool_call_id
            if isinstance(tool_call_id, str):
                following.append(tool_call_id)
            cursor += 1
        if sorted(following) != sorted(requested):
            raise AssertionError(
                f"tool_calls at {index} answered by {following}, expected {requested}"
            )


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
