"""Plan mode + deepagents 0.7 filesystem allowlist."""

from __future__ import annotations

import tempfile

from deepagents import create_deep_agent
from langchain.agents.middleware import TodoListMiddleware
from langchain_openai import ChatOpenAI

from app.services.deep_agents.plan_mode import PLAN_MODE_FS_TOOLS, read_only_filesystem_middleware
from app.services.deep_agents.project_backend import ProjectWorkspaceBackend
from app.services.deep_agents.subagents.profiles import build_subagents


def _llm() -> ChatOpenAI:
    return ChatOpenAI(model="gpt-4o-mini", api_key="x", base_url="http://127.0.0.1:9/v1")


def _backend() -> ProjectWorkspaceBackend:
    return ProjectWorkspaceBackend(
        root_dir=tempfile.mkdtemp(),
        virtual_mode=True,
        inherit_env=False,
        env={},
        timeout=5,
    )


def _tool_names(agent) -> set[str]:
    return set(agent.nodes["tools"].bound.tools_by_name)


def _subagent_tool_names(agent, name: str) -> set[str]:
    task = agent.nodes["tools"].bound.tools_by_name["task"]
    fn = task.coroutine
    cells = dict(zip(fn.__code__.co_freevars, (c.cell_contents for c in fn.__closure__), strict=True))
    graph = cells["subagent_graphs"][name]
    return set(graph.nodes["tools"].bound.tools_by_name)


def test_plan_mode_agent_exposes_read_only_fs_tools() -> None:
    backend = _backend()
    agent = create_deep_agent(
        model=_llm(),
        system_prompt="plan",
        middleware=[TodoListMiddleware(), read_only_filesystem_middleware(backend)],
        backend=backend,
        subagents=build_subagents(backend=backend, plan_mode=True, include_shell=False),
    )
    names = _tool_names(agent)
    ro = set(PLAN_MODE_FS_TOOLS)
    assert ro <= names
    assert "write_todos" in names
    assert "task" in names
    for banned in ("write_file", "edit_file", "delete", "execute"):
        assert banned not in names
    assert _subagent_tool_names(agent, "general-purpose") == ro
    assert _subagent_tool_names(agent, "explore") == ro
    assert _subagent_tool_names(agent, "research") == ro


def test_explore_is_read_only_outside_plan_mode() -> None:
    backend = _backend()
    agent = create_deep_agent(
        model=_llm(),
        system_prompt="agent",
        middleware=[TodoListMiddleware()],
        backend=backend,
        subagents=build_subagents(backend=backend, plan_mode=False, include_shell=True),
    )
    main = _tool_names(agent)
    assert "write_file" in main and "execute" in main
    assert _subagent_tool_names(agent, "explore") == set(PLAN_MODE_FS_TOOLS)
    assert "execute" in _subagent_tool_names(agent, "research")
