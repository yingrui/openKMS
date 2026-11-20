"""The two halves of an agent's runtime configuration.

A workforce agent owns everything that makes an answer *this service's* answer: instructions, model,
answer policy, orchestration, workspace, sandbox. The knowledge source owns retrieval
depth (`top_k` / `rerank` / `min_score`), because how much to pull out of a corpus is a property of the
corpus, not of the caller.

Storage keeps them apart; the qa-agent receives one object. `runtime_config` is that join, and it is
the only place the two sources are combined.
"""

from __future__ import annotations

from typing import Any

from app.models.knowledge_base import KnowledgeBase
from app.models.workforce_agent import WorkforceAgent
from app.schemas.kb_agent_config import parse_agent_config

#: qa-agent core skills, mirroring `qa_agent_proxy.CORE_AGENT_SKILLS`. Kept here so a model module
#: never imports an API module.
CORE_AGENT_SKILLS = ("ontology", "catalog", "page_index")


def agent_config_payload(raw: object) -> dict[str, Any] | None:
    """Validate a submitted config and keep only the agent's half (no `retrieval`).

    Defaults are dropped so a stored object says only what was chosen — an empty config still means
    "today's behaviour", and a reader can tell the two apart.
    """
    cfg = parse_agent_config(raw).model_dump(exclude_defaults=True, exclude_none=True)
    cfg.pop("retrieval", None)
    return cfg or None


def runtime_config(kb: KnowledgeBase, agent: WorkforceAgent | None) -> dict[str, Any]:
    """What the qa-agent receives: the agent's half, plus the knowledge source's retrieval settings.

    Without an agent (a knowledge base that has not been given one) this is exactly the pre-Workforce
    payload, so the knowledge base's own Q&A keeps its behaviour.
    """
    base = parse_agent_config(agent.agent_config if agent is not None else kb.agent_config)
    out = base.model_dump(exclude_none=True)
    out["retrieval"] = parse_agent_config(kb.agent_config).retrieval.model_dump(exclude_none=True)
    return out


def resolve_skills(raw: list | None) -> list[str]:
    """Explicit list wins; an empty/absent one means the core defaults.

    Kept for the knowledge base side, which still stores capability ids as a list; the workforce agent stores the tool
    ledger below. Both end up as the same request field.
    """
    if isinstance(raw, list) and raw:
        return [str(s) for s in raw if isinstance(s, str) and s.strip()]
    return list(CORE_AGENT_SKILLS)


def resolve_tools(raw: dict | None) -> dict[str, object]:
    """The tool ledger a request carries: `{capability_id: "all" | [tool_id, ...]}`.

    An agent stores it directly. A knowledge base still stores a capability list plus a `sandbox.enabled` flag, so its
    two fields are folded into the same ledger here — one contract on the wire, two storages behind it.
    """
    if isinstance(raw, dict) and raw:
        return {str(key): value for key, value in raw.items() if isinstance(key, str)}
    return {capability: "all" for capability in CORE_AGENT_SKILLS}


def agent_tools_for(agent: WorkforceAgent) -> dict[str, object]:
    """The ledger for one workforce agent."""
    ledger = resolve_tools(agent.agent_tools)
    sandbox = (agent.agent_config or {}).get("sandbox") or {}
    if sandbox.get("enabled"):
        ledger.setdefault("code_execution", "all")
    return ledger


def kb_tools_for(kb: KnowledgeBase) -> dict[str, object]:
    """The ledger for a knowledge base's own Q&A, where no workforce agent overrides it."""
    ledger = {capability: "all" for capability in resolve_skills(kb.agent_skills)}
    sandbox = (kb.agent_config or {}).get("sandbox") or {}
    if sandbox.get("enabled"):
        ledger["code_execution"] = "all"
    return ledger
