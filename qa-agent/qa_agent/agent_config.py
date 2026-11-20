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


def max_tool_rounds(config: dict[str, Any] | None) -> int | None:
    """How many tool rounds this request may use. `None` keeps the old behaviour: only `recursion_limit` stops a loop."""
    raw = ((config or {}).get("orchestration") or {}).get("max_tool_rounds")
    if isinstance(raw, int) and 1 <= raw <= 100:
        return raw
    return None


def system_prompt(config: dict[str, Any] | None) -> str | None:
    """The base instruction an author wrote, or `None` for the built-in text.

    This is only the first paragraph of the system prompt: the skill descriptions, the policy rules and the retrieved
    passages are appended at answer time and are not part of this text.
    """
    raw = ((config or {}).get("prompts") or {}).get("system_prompt")
    if isinstance(raw, str) and raw.strip():
        return raw
    return None


def agents_md(config: dict[str, Any] | None) -> str | None:
    """KB-wide instructions, copied into the session workspace as `AGENTS.md`. `None` when the KB has not written any."""
    raw = ((config or {}).get("prompts") or {}).get("agents_md")
    if isinstance(raw, str) and raw.strip():
        return raw
    return None


RETRIEVE_MODES = ("always", "never", "on_miss")


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


def model_id(config: dict[str, Any] | None) -> str | None:
    """The registered chat model this agent answers with; `None` means the deployment's default model.

    The id, not the vendor model name: resolving credentials needs the registry row, because the model may belong to
    a different provider than the deployment default and then the endpoint and key are that provider's.
    """
    raw = (config or {}).get("model_id")
    return raw.strip() if isinstance(raw, str) and raw.strip() else None


#: What the vendors we run accept (DeepSeek and GLM both take these three; anything else is rejected, not ignored).
REASONING_EFFORTS = ("low", "high", "max")


def reasoning_effort(config: dict[str, Any] | None) -> str | None:
    """How hard to reason, when the model takes a level. `None` leaves the model's own default.

    Sent as the OpenAI `reasoning_effort` field, which every OpenAI-compatible vendor we use reads at the top level
    (DeepSeek and GLM accept `low | high | max`). It only means something while thinking is on, so callers drop it
    when the switch is off rather than sending a contradictory pair.
    """
    raw = ((config or {}).get("generation") or {}).get("reasoning_effort")
    return raw if raw in REASONING_EFFORTS else None


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
