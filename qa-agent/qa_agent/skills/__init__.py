"""The runtime's tools, grouped by the capability that switches them on.

A capability here is a **tool switch**: enabling it puts its tools in the request's `tools` array, and each tool's own
description says what it does, when to use it and what it cannot do. There is deliberately no prose block per
capability: the schema is the description, and a second copy drifts from it. Workflows and judgement ("when the number
and the graph disagree, trust neither without a second query") belong in installable skill packages instead.
"""
from __future__ import annotations

from .catalog import catalog_tools
from .ontology import ontology_tools
from .kb_search import kb_search_tools
from .sandbox import sandbox_tools
from .page_index import page_index_tools
from .workspace import workspace_tools

__all__ = [
    "CORE_SKILL_IDS",
    "ALL_SKILL_IDS",
    "normalize_skill_ids",
    "ontology_tools",
    "catalog_tools",
    "page_index_tools",
    "kb_search_tools",
    "sandbox_tools",
    "workspace_tools",
    "get_all_skill_tools",
    "get_union_skill_tools",
]

CORE_SKILL_IDS: tuple[str, ...] = ("ontology", "catalog", "page_index")
ALL_SKILL_IDS: tuple[str, ...] = (
    *CORE_SKILL_IDS,
    #: Opt-in per KB: file tools over this conversation's own directory. Not core — a KB that does not want the agent
    #: touching files should not have to turn anything off.
    "workspace",
)

_SKILL_TOOLS: dict[str, list] = {
    "ontology": ontology_tools,
    "catalog": catalog_tools,
    "page_index": page_index_tools,
    "workspace": workspace_tools,
    # Not selectable skills: `ToolNode` must be able to execute them, while binding is a config decision.
    "_kb_search": kb_search_tools,
    "_sandbox": sandbox_tools,
}


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
