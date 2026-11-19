"""Read the KB's agent configuration on the agent side.

The object is validated by the backend (`app/schemas/kb_agent_config.AgentConfig`) and arrives already shaped; this module
only reads fields with the same defaults, so a request without a config behaves exactly as before it existed.
"""
from __future__ import annotations

from typing import Any

#: Matches `DEFAULT_TOP_K` on the backend and the value that used to be hard-coded here.
DEFAULT_TOP_K = 5

#: What `generate_node` and `finalize_node` sent before this was configurable.
DEFAULT_TEMPERATURE = 0.3


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


RETRIEVE_MODES = ("always", "never", "on_miss")


def retrieve_mode(config: dict[str, Any] | None) -> str:
    """Where context comes from.

    `always` (default) pre-retrieves five passages into the prompt, which is what the agent has always done. `never` skips
    retrieval entirely — tools only. `on_miss` skips the pre-retrieval and binds a search tool instead, so the model fetches
    context when it decides it is missing.
    """
    raw = ((config or {}).get("orchestration") or {}).get("retrieve")
    return raw if raw in RETRIEVE_MODES else "always"


def require_schema_lookup(config: dict[str, Any] | None) -> bool:
    """Whether the model must read the model's schema before querying it."""
    return bool(answer_policy(config).get("require_schema_lookup"))


GROUNDING_MODES = ("off", "mark", "enforce")


def require_grounded_numbers(config: dict[str, Any] | None) -> str:
    """What to do with numbers that appear in no cited source.

    `off` (default) computes and reports the ratio and says nothing more. `mark` adds a warning to the response. `enforce`
    adds the warning and flags the answer, so a caller can refuse to present it as verified. None of them edits the prose:
    rewriting an answer's numbers after the fact is how a wrong figure becomes an invisible one.
    """
    raw = answer_policy(config).get("require_grounded_numbers")
    return raw if raw in GROUNDING_MODES else "off"


def temperature(config: dict[str, Any] | None) -> float:
    """Sampling temperature for this request; `0.3` is what the agent sent before it was configurable."""
    raw = ((config or {}).get("generation") or {}).get("temperature")
    if isinstance(raw, (int, float)) and 0.0 <= float(raw) <= 2.0:
        return float(raw)
    return DEFAULT_TEMPERATURE


def top_p(config: dict[str, Any] | None) -> float | None:
    """Nucleus sampling mass; `None` leaves the gateway default."""
    raw = ((config or {}).get("generation") or {}).get("top_p")
    if isinstance(raw, (int, float)) and 0.0 <= float(raw) <= 1.0:
        return float(raw)
    return None


def max_tokens(config: dict[str, Any] | None) -> int | None:
    """Answer length ceiling; `None` leaves the gateway default."""
    raw = ((config or {}).get("generation") or {}).get("max_tokens")
    if isinstance(raw, int) and 1 <= raw <= 32_768:
        return raw
    return None


def rerank_override(config: dict[str, Any] | None) -> bool | None:
    """Per-corpus rerank choice: `None` follows the deployment, `True`/`False` force it.

    Retrieval depth belongs to the knowledge source (this reads `retrieval.rerank` off the KB's config). `True`
    still needs a rerank endpoint in the deployment; `retriever.retrieve` skips the call when there is none.
    """
    raw = ((config or {}).get("retrieval") or {}).get("rerank")
    return raw if isinstance(raw, bool) else None


def enable_thinking(config: dict[str, Any] | None) -> bool:
    """Whether gateways that expose `extra_body.enable_thinking` should think. Off by default, as before."""
    raw = ((config or {}).get("generation") or {}).get("thinking")
    return raw == "on"
