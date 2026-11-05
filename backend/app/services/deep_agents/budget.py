"""Step-budget awareness for project agent turns.

LangGraph stops a turn with ``GraphRecursionError`` once ``recursion_limit`` supersteps are
spent, and the user is left with a raw error string instead of the work that was done. A single
tool round costs about two supersteps (one to call the model, one to run the tools), so the
default 200 steps is roughly 90 tool calls — reachable by an ordinary research turn.

Warn the model before the wall so it can close out, and resume once if it still runs out.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain.agents.middleware import TodoListMiddleware
from langchain_core.messages import SystemMessage

logger = logging.getLogger(__name__)

# Fraction of `recursion_limit` at which the model is told to start wrapping up.
WARN_AT_FRACTION = 0.75

# Steps the model can still take after the warning (model call + tool round) before the
# limit is hit; below this the warning would arrive too late to be actionable.
_MIN_HEADROOM = 8

_WARNING = (
    "【步数预算预警】本轮已用掉约 {used} / {limit} 步，很快会触到执行上限。"
    "请立刻收尾：停止新的探索和调试循环，用已有信息直接给出结论；"
    "需要外部资料时，把剩余调研交给 task 子代理完成，不要继续在父对话里逐个尝试命令。"
)


class BudgetAwareTodoMiddleware(TodoListMiddleware):
    """TodoList middleware that also warns the model as the step budget runs low.

    Subclasses an existing middleware instead of adding one: every additional agent
    middleware installs its own graph node, which costs one superstep per model turn and
    would itself eat into the budget being protected. Reusing ``after_model`` keeps the
    graph shape identical (measured: no extra supersteps).

    The counter tracks model turns rather than true supersteps, so ``used`` is an estimate —
    good enough to warn with, never used for a hard cutoff (LangGraph still owns that).
    """

    def __init__(self, *, recursion_limit: int) -> None:
        super().__init__()
        self.recursion_limit = recursion_limit
        self._turns = 0
        self._warned = False

    @property
    def warn_at_turn(self) -> int:
        """Turn at which to warn: 75% of the budget, but never so late it can't be acted on."""
        budget_turns = int(self.recursion_limit * WARN_AT_FRACTION) // 2
        return max(1, budget_turns - _MIN_HEADROOM)

    def after_model(self, state: Any, runtime: Any) -> dict[str, Any] | None:
        base = super().after_model(state, runtime)
        self._turns += 1
        if self._warned or self._turns < self.warn_at_turn:
            return base

        self._warned = True
        estimate = min(self._turns * 2, self.recursion_limit)
        logger.info(
            "agent_budget_warning turn=%s limit=%s estimated_steps=%s",
            self._turns,
            self.recursion_limit,
            estimate,
        )
        update = dict(base or {})
        update["messages"] = [
            *(update.get("messages") or []),
            SystemMessage(
                content=_WARNING.format(used=estimate, limit=self.recursion_limit)
            ),
        ]
        return update


def make_budget_middleware(recursion_limit: int) -> TodoListMiddleware:
    """TodoList middleware with budget awareness (replaces the plain one, adds no node)."""
    return BudgetAwareTodoMiddleware(recursion_limit=recursion_limit)
