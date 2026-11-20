"""The runtime's tools, grouped by the capability that switches them on.

A capability here is a **tool switch**: enabling it puts its tools in the request's `tools` array, and each tool's own
description says what it does, when to use it and what it cannot do. There is deliberately no prose block per
capability: the schema is the description, and a second copy drifts from it. Workflows and judgement ("when the number
and the graph disagree, trust neither without a second query") belong in installable skill packages instead.
"""
from __future__ import annotations

from typing import Any

from .catalog import catalog_tools
from .ontology import ontology_tools
from .kb_search import kb_search_tools
from .web_search import web_search_tools
from .sandbox import sandbox_tools
from .page_index import page_index_tools
from .workspace import workspace_tools

__all__ = [
    "CORE_SKILL_IDS",
    "ALL_SKILL_IDS",
    "normalize_skill_ids",
    "tools_for",
    "ontology_tools",
    "catalog_tools",
    "page_index_tools",
    "kb_search_tools",
    "web_search_tools",
    "sandbox_tools",
    "workspace_tools",
    "get_all_skill_tools",
    "get_union_skill_tools",
]

#: What an agent gets when it enables nothing. `knowledge_search` belongs here because a workforce agent is a service over
#: a knowledge base: one that cannot read its corpus is a configuration nobody means to choose.
CORE_SKILL_IDS: tuple[str, ...] = ("knowledge_search", "ontology", "catalog", "page_index")
ALL_SKILL_IDS: tuple[str, ...] = (
    *CORE_SKILL_IDS,
    #: The web leaves the tenant's boundary, so it is a decision, never a default.
    "web_search",
    #: Opt-in per KB: file tools over this conversation's own directory. Not core — a KB that does not want the agent
    #: touching files should not have to turn anything off.
    "workspace",
)

_SKILL_TOOLS: dict[str, list] = {
    "ontology": ontology_tools,
    "catalog": catalog_tools,
    "page_index": page_index_tools,
    "workspace": workspace_tools,
    "knowledge_search": kb_search_tools,
    "web_search": web_search_tools,
    # Not a selectable capability: `run_python`/`run_command` live in the sandbox group, added by the ledger.
    "_kb_search": kb_search_tools,
    "_sandbox": sandbox_tools,
}


def tools_for(agent_tools: dict[str, Any] | None) -> list:
    """The tool objects one request may use.

    `agent_tools` is the ledger: `{capability_id: "all" | [tool_id, ...]}`. A missing key means the capability is off;
    `"all"` means everything it currently provides (a new tool reaches every agent that said "all"); a list is an
    explicit subset — "shell but not python" is `{"code_execution": ["exec.shell"]}`.

    Unknown ids are ignored rather than fatal: the catalogue moves forward with the code, and a stored selection from
    an older deploy should not break an answer.
    """
    from .sandbox import sandbox_tools
    from ..tool_catalog import TOOL_IDS

    selected = agent_tools or {}
    if not selected:
        return get_all_skill_tools(list(CORE_SKILL_IDS))

    tools: list = []
    for capability_id, choice in selected.items():
        group = sandbox_tools if capability_id == "code_execution" else _SKILL_TOOLS.get(capability_id, [])
        if not group:
            continue
        if choice == "all" or choice is None:
            tools.extend(group)
            continue
        if isinstance(choice, str):
            choice = [choice]
        wanted = {str(item) for item in choice}
        tools.extend(tool for tool in group if TOOL_IDS.get(tool.name, tool.name) in wanted)
    return tools or get_all_skill_tools(list(CORE_SKILL_IDS))


def normalize_skill_ids(skills: list[str] | None) -> list[str]:
    """Resolve the skill set for one ask. None/empty → core only."""
    if not skills:
        return list(CORE_SKILL_IDS)
    allowed = set(ALL_SKILL_IDS)
    out: list[str] = []
    seen: set[str] = set()
    for s in skills:
        if not isinstance(s, str):
            continue
        key = s.strip()
        if key in allowed and key not in seen:
            seen.add(key)
            out.append(key)
    return out or list(CORE_SKILL_IDS)


def get_all_skill_tools(skills: list[str] | None = None) -> list:
    """Tools for the selected skills (default: core). Pass ``skills=\"*\"`` via None + all for ToolNode."""
    ids = normalize_skill_ids(skills)
    tools: list = []
    for sid in ids:
        tools.extend(_SKILL_TOOLS.get(sid, []))
    return tools


def get_union_skill_tools() -> list:
    """Every registered tool (for ToolNode execution regardless of bind set)."""
    tools: list = []
    for group in _SKILL_TOOLS.values():
        tools.extend(group)
    return tools
