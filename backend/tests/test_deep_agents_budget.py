"""Step-budget warning + continuation for project agent turns."""

from __future__ import annotations

from typing import Any

import pytest
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.errors import GraphRecursionError

from app.services.runtime.deep_agents import runner
from app.services.runtime.deep_agents.budget import (
    WARN_AT_FRACTION,
    BudgetAwareTodoMiddleware,
    make_budget_middleware,
)


class _State(dict):
    """Minimal stand-in for the LangGraph agent state."""


def test_warning_lands_early_enough_to_act_on() -> None:
    """The warning must leave room for the model to wrap up before the hard limit."""
    mw = BudgetAwareTodoMiddleware(recursion_limit=200)
    # ~2 supersteps per tool round, so the warning turn must sit well before step 200.
    assert mw.warn_at_turn * 2 < 200
    assert mw.warn_at_turn > 0


def test_warning_fires_once_and_includes_budget() -> None:
    mw = BudgetAwareTodoMiddleware(recursion_limit=200)
    state = _State(messages=[HumanMessage(content="hi")])
    updates: list[dict[str, Any] | None] = []
    for _ in range(mw.warn_at_turn + 5):
        updates.append(mw.before_model(state, None))
        mw.after_model(state, None)

    warned = [u for u in updates if u and u.get("messages")]
    assert len(warned) == 1, "warn exactly once, not on every turn"
    content = str(warned[0]["messages"][0].content)
    assert "200" in content
    assert isinstance(warned[0]["messages"][0], SystemMessage)


def test_warning_is_never_injected_after_a_tool_call() -> None:
    """Regression: a `SystemMessage` there breaks the provider's tool-call pairing rule."""
    mw = BudgetAwareTodoMiddleware(recursion_limit=200)
    state = _State(messages=[HumanMessage(content="hi")])
    for _ in range(mw.warn_at_turn + 5):
        after = mw.after_model(state, None)
        assert not (after and after.get("messages")), "after_model must not add messages"


def test_middleware_keeps_todo_behaviour() -> None:
    """Budget awareness must not replace TodoList semantics."""
    mw = make_budget_middleware(200)
    assert isinstance(mw, BudgetAwareTodoMiddleware)
    assert hasattr(mw, "tools"), "TodoListMiddleware still contributes write_todos"


def test_warn_fraction_is_conservative() -> None:
    assert 0.5 <= WARN_AT_FRACTION < 1.0


async def _collect(gen) -> list[dict[str, Any]]:
    return [part async for part in gen]


@pytest.mark.asyncio
async def test_continuation_resumes_then_returns_text(monkeypatch) -> None:
    """A turn that hits the limit once continues and still answers the user."""
    calls: list[tuple[Any, int]] = []

    async def fake_parts(agent, payload, cfg):
        calls.append((payload, cfg["recursion_limit"]))
        if len(calls) == 1:
            raise GraphRecursionError("Recursion limit of 200 reached")
        yield {"type": "delta", "t": "总结：已完成"}

    monkeypatch.setattr(runner, "iter_langgraph_stream_parts", fake_parts)

    cfg = {"recursion_limit": 200, "configurable": {"thread_id": "t"}}
    parts = await _collect(
        runner._stream_parts_with_continuation(object(), {"messages": []}, cfg)
    )

    assert [p.get("t") for p in parts if p.get("type") == "delta"] == ["总结：已完成"]
    assert len(calls) == 2
    # Continuation gets a fresh budget rather than replaying with the exhausted one.
    assert calls[1][1] == 200 + runner.CONTINUATION_STEPS
    # The first attempt keeps the caller's input; the retry nudges instead of restarting.
    assert calls[0][0] == {"messages": []}
    assert isinstance(calls[1][0]["messages"][0], SystemMessage)


@pytest.mark.asyncio
async def test_continuation_gives_up_after_max(monkeypatch) -> None:
    """Continuations are bounded: still exceeding the limit surfaces the error."""
    async def always_recurses(agent, payload, cfg):
        raise GraphRecursionError("Recursion limit of 200 reached")
        yield  # pragma: no cover

    monkeypatch.setattr(runner, "iter_langgraph_stream_parts", always_recurses)

    cfg = {"recursion_limit": 200}
    with pytest.raises(GraphRecursionError):
        await _collect(runner._stream_parts_with_continuation(object(), {}, cfg))
    assert runner.CONTINUATION_MAX < 5, "do not spin on a turn that cannot finish"


def test_budget_config_adds_steps_without_mutating_original() -> None:
    cfg = {"recursion_limit": 200, "metadata": {"k": "v"}}
    out = runner._budget_config(cfg, 60)
    assert out["recursion_limit"] == 260
    assert cfg["recursion_limit"] == 200
    assert out["metadata"] == cfg["metadata"]


def test_turn_failure_hides_raw_recursion_text() -> None:
    msg, record = runner._turn_failure(GraphRecursionError("long internal detail"))
    assert record is None
    assert "Recursion limit" in msg


def test_system_prompt_teaches_delegation_and_budget() -> None:
    from app.services.runtime.deep_agents.prompts import _BASE_PROMPT

    assert "research` subagent" in _BASE_PROMPT
    assert "budget" in _BASE_PROMPT.lower()
    assert "more than once" in _BASE_PROMPT, "must discourage retry loops"
