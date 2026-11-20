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

#: Groups, by *what a capability touches*. The order is the order on screen: knowledge first (what an answer is made
#: of), then the runtime that runs things. A new capability joins a group; it does not need a new layout.
GROUPS: tuple[tuple[str, str], ...] = (
    ("documents", "Documents"),
    ("data", "Data and graph"),
    ("files", "Files"),
    ("runtime", "Runtime"),
)

GROUPS_ZH: dict[str, str] = {
    "documents": "文档",
    "data": "数据与图谱",
    "files": "文件",
    "runtime": "运行",
}

#: One line per capability: what it is for. Display metadata — it never enters a prompt, so it costs no tokens.
CAPABILITY_SUMMARIES: dict[str, str] = {
    "catalog": "Query metrics, fields and tables from the semantic models this agent may read.",
    "ontology": "Walk the object graph: coverage and relationship questions.",
    "page_index": "Read a document section by section when retrieved chunks are not enough.",
    "workspace": "Read and write files in this conversation's directory.",
    "code_execution": "Run Python, and shell commands from an allow list, inside the conversation directory.",
}

#: What must be bound on the agent before the capability can do anything. Without it the switch is on and the tool has
#: nothing to look at — which is the state the Tools tab's bindings exist to avoid.
CAPABILITY_REQUIRES: dict[str, tuple[str, ...]] = {
    "catalog": ("semantic_model",),
    "ontology": ("ontology_group",),
}

#: Display names. The id is the contract with `agent_skills`; the name is what a person reads.
CAPABILITY_NAMES: dict[str, str] = {
    "ontology": "Ontology",
    "catalog": "Catalog",
    "page_index": "Page index",
    "workspace": "Workspace files",
}

#: The two environment tools read better by what they run than by their callable name. The callable name stays: it is
#: what appears in a tool call and in a trace, so the label is a display name, not a rename.
ENVIRONMENT_TOOL_LABELS: dict[str, str] = {
    "run_python_tool": "Python",
    "run_command_tool": "Shell",
}

CAPABILITY_TOOLS: dict[str, list[Any]] = {
    "ontology": ontology_tools,
    "catalog": catalog_tools,
    "page_index": page_index_tools,
    "workspace": workspace_tools,
}

#: Which group each capability belongs to. `code_execution` is not an `agent_skills` id — it is enabled by
#: `agent_config.sandbox.enabled` — but it is a capability all the same, so it is listed with the others.
CAPABILITY_GROUPS: dict[str, str] = {
    "catalog": "data",
    "ontology": "data",
    "page_index": "documents",
    "workspace": "files",
    "code_execution": "runtime",
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


def _prose(text: str) -> str:
    """A docstring's folded lines become one paragraph per blank line.

    The words are the ones the model receives; only the wrapping goes. Without this the screen shows the indentation
    the source has — a paragraph with a ragged four-space gutter down its left side.
    """
    paragraphs = [block for block in text.strip().split("\n\n") if block.strip()]
    return "\n\n".join(
        " ".join(line.strip() for line in block.splitlines() if line.strip()) for block in paragraphs
    )


def _tool(tool: Any, label: str | None = None) -> dict[str, Any]:
    return {
        "name": tool.name,
        # A display name when the callable name is not the clearest heading; the callable name stays in `name`.
        **({"label": label} if label else {}),
        # The same words the model receives as the function description — one copy, so they cannot disagree.
        "description": _prose(tool.description or ""),
        "parameters": _parameters(tool),
    }


def tool_catalog() -> dict[str, Any]:
    """The catalogue the Tools screen renders and the model is given.

    Ordered by group, then by the runtime's own order inside a group, so the screen never invents an order of its own.
    """
    capabilities: list[dict[str, Any]] = []
    for skill_id in ALL_SKILL_IDS:
        tools = CAPABILITY_TOOLS.get(skill_id) or []
        if not tools:
            continue
        capabilities.append(
            {
                "id": skill_id,
                "name": CAPABILITY_NAMES.get(skill_id, skill_id),
                "group": CAPABILITY_GROUPS.get(skill_id, "runtime"),
                "summary": CAPABILITY_SUMMARIES.get(skill_id),
                "requires": list(CAPABILITY_REQUIRES.get(skill_id, ())),
                # Core = enabled when the agent enables nothing (same rule as `normalize_skill_ids`).
                "core": skill_id in CORE_SKILL_IDS,
                "tools": [_tool(tool) for tool in tools],
            }
        )

    capabilities.append(
        {
            "id": "code_execution",
            "name": "Code execution",
            "group": "runtime",
            "summary": CAPABILITY_SUMMARIES["code_execution"],
            "requires": [],
            # Off unless an agent turns it on, so not "core" — but it is an environment capability, not a skill id.
            "core": False,
            "tools": [
                _tool(tool, ENVIRONMENT_TOOL_LABELS.get(tool.name)) for tool in sandbox_tools
            ],
            # Policy belongs to the capability, not to the bottom of the page: a limit is part of what it can do.
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
        }
    )

    order = {group_id: index for index, (group_id, _) in enumerate(GROUPS)}
    capabilities.sort(key=lambda item: (order.get(item["group"], len(order)), not item["core"]))
    return {
        "groups": [
            {"id": group_id, "name": name, "name_zh": GROUPS_ZH.get(group_id, name)}
            for group_id, name in GROUPS
        ],
        "capabilities": capabilities,
    }
