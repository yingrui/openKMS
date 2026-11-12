"""Tool-call pairing repair.

Providers reject a thread where an assistant message requests a tool call and no `tool` message
answers it:

    400 An assistant message with 'tool_calls' must be followed by tool messages responding to
        each 'tool_call_id'. (insufficient tool messages following tool_calls message)

We produce that state ourselves whenever a turn dies mid-tool (restart, crash, killed backend):
the request is persisted, the result never is. Compaction can also slice between the pair.

The repair **inserts** a placeholder tool message rather than deleting the assistant message, so
the model keeps its own reasoning and the transcript stays truthful.
"""

from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from app.services.runtime.deep_agents.tool_call_repair import (
    INTERRUPTED_TOOL_CONTENT,
    assert_tool_call_pairing,
    repair_tool_call_pairing,
    summarize_unpaired,
)


def _ai(*call_ids: str) -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[{"id": cid, "name": "execute", "args": {"command": "echo hi"}} for cid in call_ids],
    )


def _tool(call_id: str) -> ToolMessage:
    return ToolMessage(content="ok", tool_call_id=call_id, name="execute")


def test_a_paired_thread_is_untouched():
    messages = [HumanMessage("q"), _ai("c1"), _tool("c1")]
    fixed, repaired = repair_tool_call_pairing(messages)
    assert repaired == 0
    assert fixed == messages


def test_the_interrupted_tail_gets_a_placeholder():
    """The exact shape a killed turn leaves: request persisted, result never written."""
    messages = [HumanMessage("q"), _ai("c1")]
    fixed, repaired = repair_tool_call_pairing(messages)
    assert repaired == 1
    assert isinstance(fixed[-1], ToolMessage)
    assert fixed[-1].tool_call_id == "c1"
    assert fixed[-1].content == INTERRUPTED_TOOL_CONTENT
    assert_tool_call_pairing(fixed)


def test_every_call_of_a_parallel_batch_is_answered():
    """One assistant message may request several tools; all of them need a response."""
    messages = [HumanMessage("q"), _ai("c1", "c2", "c3"), _tool("c1")]
    fixed, repaired = repair_tool_call_pairing(messages)
    assert repaired == 2
    assert summarize_unpaired(fixed) == []
    assert_tool_call_pairing(fixed)


def test_the_assistant_message_is_kept():
    """Deleting it would lose the model's own reasoning about what it was doing."""
    messages = [HumanMessage("q"), _ai("c1")]
    fixed, _ = repair_tool_call_pairing(messages)
    assert any(isinstance(m, AIMessage) and m.tool_calls for m in fixed)


def test_order_is_preserved():
    messages = [HumanMessage("q"), _ai("c1"), HumanMessage("next")]
    fixed, _ = repair_tool_call_pairing(messages)
    assert [type(m).__name__ for m in fixed] == [
        "HumanMessage",
        "AIMessage",
        "ToolMessage",
        "HumanMessage",
    ]


def test_a_hole_in_the_middle_is_filled():
    """Compaction can slice between a request and its response, not only at the tail."""
    messages = [_ai("c1"), HumanMessage("later"), _ai("c2"), _tool("c2")]
    fixed, repaired = repair_tool_call_pairing(messages)
    assert repaired == 1
    assert summarize_unpaired(fixed) == []


def test_an_empty_thread_is_a_no_op():
    assert repair_tool_call_pairing([]) == ([], 0)


def test_a_response_before_the_request_is_moved_back():
    """A tool message that ended up above its request is still *the* response."""
    messages = [_tool("c1"), HumanMessage("q"), _ai("c1")]
    fixed, repaired = repair_tool_call_pairing(messages)

    assert repaired == 0, "no placeholder: the response exists"
    assert [type(m).__name__ for m in fixed] == [
        "HumanMessage",
        "AIMessage",
        "ToolMessage",
    ]
    assert fixed[-1].tool_call_id == "c1"


def test_a_message_between_the_request_and_its_result_is_ordered_out():
    """The real 400: the budget warning's SystemMessage sat between the pair."""
    warning = SystemMessage(content="【步数预算预警】")
    messages = [HumanMessage("q"), _ai("c1"), warning, _tool("c1"), HumanMessage("next")]
    fixed, repaired = repair_tool_call_pairing(messages)

    assert repaired == 0
    assert [type(m).__name__ for m in fixed] == [
        "HumanMessage",
        "AIMessage",
        "ToolMessage",
        "SystemMessage",
        "HumanMessage",
    ]
    assert assert_tool_call_pairing(fixed) is None


def test_duplicate_responses_are_collapsed():
    messages = [HumanMessage("q"), _ai("c1"), _tool("c1"), _tool("c1")]
    fixed, repaired = repair_tool_call_pairing(messages)
    assert repaired == 0
    assert sum(isinstance(m, ToolMessage) for m in fixed) == 1


def test_orphan_tool_messages_are_dropped():
    messages = [HumanMessage("q"), _tool("nobody-asked")]
    fixed, repaired = repair_tool_call_pairing(messages)
    assert repaired == 0
    assert not any(isinstance(m, ToolMessage) for m in fixed)
