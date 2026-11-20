"""What the runtime can do, described once, for both the model and the person configuring an agent.

Two things live here, and they are different in kind:

* **A capability** (`ontology`, `catalog`, …) is a tool switch. Enabling it puts its tools into the request's `tools`
  array; the model reads each tool's own description, so the same text is what the configuration screen shows.
* **Environment tools** (`run_python_tool`, `run_command_tool`) are always part of the environment when code
  execution is on, and their policy is data — the command allowlist is the interesting part, because "what can it
  start" is a question the person configuring the agent must be able to answer without reading code.

Nothing here describes *how to work* — no step-by-step prose, no sample dialogues. Procedures belong in skill
packages (authored, versioned, installable); this module exports the contract only.
"""

from __future__ import annotations

from typing import Any

from .skills import ALL_SKILL_IDS, CORE_SKILL_IDS, sandbox_tools
from .skills import catalog_tools, ontology_tools, page_index_tools, workspace_tools
from .sandbox import ALLOWED_COMMANDS, DEFAULT_TIMEOUT_SECONDS

#: Display names. The id is the contract with `agent_skills`; the name is what a person reads.
CAPABILITY_NAMES: dict[str, str] = {
    "ontology": "Ontology",
    "catalog": "Catalog",
    "page_index": "Page index",
    "workspace": "Workspace files",
}

CAPABILITY_TOOLS: dict[str, list[Any]] = {
    "ontology": ontology_tools,
    "catalog": catalog_tools,
    "page_index": page_index_tools,
    "workspace": workspace_tools,
}


def _parameters(tool: Any) -> dict[str, Any]:
    schema = getattr(tool, "args_schema", None)
    if schema is None:
        return {}
    json_schema = schema.model_json_schema()
    # `title` repeats the tool name on every property of a generated schema; it adds tokens and no information.
    for value in (json_schema.get("properties") or {}).values():
        if isinstance(value, dict):
            value.pop("title", None)
    return json_schema


def _tool(tool: Any) -> dict[str, Any]:
    return {
        "name": tool.name,
        # The same string the model receives as the function description — one copy, so they cannot disagree.
        "description": (tool.description or "").strip(),
        "parameters": _parameters(tool),
    }


def tool_catalog() -> dict[str, Any]:
    """The catalogue the Tools screen renders and the model is given."""
    capabilities = []
    for skill_id in ALL_SKILL_IDS:
        tools = CAPABILITY_TOOLS.get(skill_id) or []
        if not tools:
            continue
        capabilities.append(
            {
                "id": skill_id,
                "name": CAPABILITY_NAMES.get(skill_id, skill_id),
                # Core = enabled when the agent enables nothing (same rule as `normalize_skill_ids`).
                "core": skill_id in CORE_SKILL_IDS,
                "tools": [_tool(tool) for tool in tools],
            }
        )

    return {
        "capabilities": capabilities,
        "environment": {
            "id": "sandbox",
            "name": "Code execution",
            "tools": [_tool(tool) for tool in sandbox_tools],
            "policy": {
                # Where a command runs and what it may write. The model's container is the conversation directory,
                # so `out/` is where artifacts land and everything else is read-only by convention.
                "cwd": "conversation directory",
                "writable": "out/",
                "builtin_allow": sorted(ALLOWED_COMMANDS),
                "timeout_seconds": DEFAULT_TIMEOUT_SECONDS,
                # The allowlist is additive: an agent may extend it, never shrink the built-in set.
                "allowlist": "additive",
            },
        },
    }
