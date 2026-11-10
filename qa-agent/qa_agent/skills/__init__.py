"""LangGraph skills: ontology, catalog, page_index, optional insurance demos."""
from __future__ import annotations

from .catalog import catalog_tools
from .insurance_calculator import calculator_tools
from .ontology import ontology_tools
from .page_index import page_index_tools
from .workspace import workspace_tools
from .premium_estimator import premium_tools
from .product_comparator import comparator_tools

__all__ = [
    "CORE_SKILL_IDS",
    "ALL_SKILL_IDS",
    "normalize_skill_ids",
    "ontology_tools",
    "catalog_tools",
    "page_index_tools",
    "workspace_tools",
    "calculator_tools",
    "premium_tools",
    "comparator_tools",
    "get_all_skill_tools",
    "get_union_skill_tools",
    "get_skill_prompt_fragments",
]

CORE_SKILL_IDS: tuple[str, ...] = ("ontology", "catalog", "page_index")
ALL_SKILL_IDS: tuple[str, ...] = (
    *CORE_SKILL_IDS,
    #: Opt-in per KB: file tools over this conversation's own directory. Not core — a KB that does not want the agent
    #: touching files should not have to turn anything off.
    "workspace",
    "insurance_calculator",
    "premium_estimator",
    "product_comparator",
)

_SKILL_TOOLS: dict[str, list] = {
    "ontology": ontology_tools,
    "catalog": catalog_tools,
    "page_index": page_index_tools,
    "workspace": workspace_tools,
    "insurance_calculator": calculator_tools,
    "premium_estimator": premium_tools,
    "product_comparator": comparator_tools,
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
    """Every registered skill tool (for ToolNode execution regardless of bind set)."""
    tools: list = []
    for sid in ALL_SKILL_IDS:
        tools.extend(_SKILL_TOOLS[sid])
    return tools


def get_skill_prompt_fragments(skills: list[str] | None = None) -> str:
    """Prompt fragments for the selected skills only."""
    from .catalog import CATALOG_PROMPT
    from .insurance_calculator import CALCULATOR_PROMPT
    from .ontology import ONTOLOGY_PROMPT
    from .page_index import PAGE_INDEX_PROMPT
    from .workspace import WORKSPACE_PROMPT
    from .premium_estimator import PREMIUM_PROMPT
    from .product_comparator import COMPARATOR_PROMPT

    prompts = {
        "ontology": ONTOLOGY_PROMPT,
        "catalog": CATALOG_PROMPT,
        "page_index": PAGE_INDEX_PROMPT,
        "workspace": WORKSPACE_PROMPT,
        "insurance_calculator": CALCULATOR_PROMPT,
        "premium_estimator": PREMIUM_PROMPT,
        "product_comparator": COMPARATOR_PROMPT,
    }
    ids = normalize_skill_ids(skills)
    return "\n\n".join(prompts[s] for s in ids if s in prompts)
