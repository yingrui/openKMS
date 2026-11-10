"""Read the KB's agent configuration on the agent side.

The object is validated by the backend (`app/schemas/kb_agent_config.AgentConfig`) and arrives already shaped; this module
only reads fields with the same defaults, so a request without a config behaves exactly as before it existed.
"""
from __future__ import annotations

from typing import Any

#: Matches `DEFAULT_TOP_K` on the backend and the value that used to be hard-coded here.
DEFAULT_TOP_K = 5


def top_k(config: dict[str, Any] | None) -> int:
    raw = ((config or {}).get("retrieval") or {}).get("top_k")
    if isinstance(raw, int) and 1 <= raw <= 50:
        return raw
    return DEFAULT_TOP_K


def answer_policy(config: dict[str, Any] | None) -> dict[str, Any]:
    policy = (config or {}).get("answer_policy")
    return policy if isinstance(policy, dict) else {}


def unknown_measure_policy(config: dict[str, Any] | None) -> str:
    """`refuse` when the asked measure is not in the model's measures; `try_anyway` (the default) keeps today's behaviour."""
    value = answer_policy(config).get("unknown_measure")
    return value if value in ("refuse", "try_anyway") else "try_anyway"


def workspace_enabled(config: dict[str, Any] | None) -> bool:
    return bool(((config or {}).get("workspace") or {}).get("enabled"))


def max_tool_rounds(config: dict[str, Any] | None) -> int | None:
    """How many tool rounds this request may use. `None` keeps the old behaviour: only `recursion_limit` stops a loop."""
    raw = ((config or {}).get("orchestration") or {}).get("max_tool_rounds")
    if isinstance(raw, int) and 1 <= raw <= 100:
        return raw
    return None


def agents_md(config: dict[str, Any] | None) -> str | None:
    """KB-wide instructions, copied into the session workspace as `AGENTS.md`. `None` when the KB has not written any."""
    raw = ((config or {}).get("prompts") or {}).get("agents_md")
    if isinstance(raw, str) and raw.strip():
        return raw
    return None
