"""Wiki agent ChatOpenAI extra_body (thinking mode not supported)."""

from __future__ import annotations

from unittest.mock import patch

from langchain_core.messages import AIMessage, HumanMessage

from app.services.agent.wiki_runner import (
    _wiki_agent_chat_extra_body,
    _wiki_pre_model_sanitize_llm_input,
    _wiki_sanitize_aimessage_for_llm,
    _wiki_sanitize_messages_for_wiki_llm,
)


def test_always_disables_thinking() -> None:
    with patch("app.services.agent.wiki_runner.settings") as s:
        s.agent_llm_extra_body_json = None
        e = _wiki_agent_chat_extra_body()
    assert e == {"enable_thinking": False}


def test_user_extra_merged_then_thinking_forced_off() -> None:
    with patch("app.services.agent.wiki_runner.settings") as s:
        s.agent_llm_extra_body_json = '{"enable_thinking": true, "x": 1}'
        e = _wiki_agent_chat_extra_body()
    assert e["enable_thinking"] is False
    assert e["x"] == 1


def test_sanitize_aimessage_strips_thinking_blocks() -> None:
    m = AIMessage(
        content=[
            {"type": "reasoning", "reasoning": "internal"},
            {"type": "text", "text": "Hello"},
        ]
    )
    s = _wiki_sanitize_aimessage_for_llm(m)
    assert s.content == [{"type": "text", "text": "Hello"}]
    assert s.additional_kwargs == {}


def test_sanitize_aimessage_preserves_tool_calls() -> None:
    m = AIMessage(
        content="",
        tool_calls=[{"name": "x", "args": {}, "id": "call-1", "type": "tool_call"}],
    )
    s = _wiki_sanitize_aimessage_for_llm(m)
    assert s.content == ""
    assert len(s.tool_calls) == 1


def test_pre_model_hook_returns_sanitized_llm_input() -> None:
    state = {
        "messages": [
            HumanMessage(content="hi"),
            AIMessage(
                content=[{"type": "reasoning_content", "text": "x"}],
                additional_kwargs={"reasoning": {"type": "reasoning"}},
            ),
        ]
    }
    out = _wiki_pre_model_sanitize_llm_input(state)
    llm_in = out["llm_input_messages"]
    assert isinstance(llm_in[1], AIMessage)
    assert llm_in[1].content in ("", None) or llm_in[1].content == []
    assert llm_in[1].additional_kwargs == {}


def test_sanitize_messages_only_touches_ai() -> None:
    msgs = [HumanMessage(content="u"), AIMessage(content="a")]
    s = _wiki_sanitize_messages_for_wiki_llm(msgs)
    assert s[0] is msgs[0]
    assert isinstance(s[1], AIMessage)
    assert s[1].content == "a"
