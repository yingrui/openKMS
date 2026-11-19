"""Cached effective LLM config (backend defaults + optional env overrides)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .backend_defaults import resolve_llm_for_agent, resolve_llm_for_model, resolve_thinking_fragments
from .config import openai_v1_base, settings

_cache: "EffectiveLlmConfig | None" = None
_cache_by_model: dict[str, "EffectiveLlmConfig"] = {}


@dataclass(frozen=True)
class EffectiveLlmConfig:
    base_url: str
    api_key: str
    model_name: str
    #: Body fragments this provider merges for thinking on / off (`{}` = the provider cannot be asked).
    thinking_fragments: dict[str, dict[str, Any]] = field(default_factory=dict)

    @property
    def openai_v1_base_url(self) -> str:
        return openai_v1_base(self.base_url)


def clear_llm_config_cache() -> None:
    global _cache
    _cache = None
    _cache_by_model.clear()


def get_effective_llm_config(*, force_refresh: bool = False) -> EffectiveLlmConfig:
    global _cache
    if not force_refresh and _cache is not None:
        return _cache
    base_url, model_name, api_key = resolve_llm_for_agent(settings)
    _cache = EffectiveLlmConfig(
        base_url=base_url,
        api_key=api_key,
        model_name=model_name,
        thinking_fragments=resolve_thinking_fragments(settings),
    )
    return _cache


def get_llm_config(model_id: str | None, *, force_refresh: bool = False) -> "EffectiveLlmConfig":
    """The model this request should use: the agent's choice, or the deployment default.

    A model the backend cannot resolve no longer exists (or lost its key). Rather than failing every answer — or
    silently answering with a different model — the caller falls back to the default and logs; the response then
    names the model it actually used.
    """
    if not model_id:
        return get_effective_llm_config(force_refresh=force_refresh)
    if not force_refresh and model_id in _cache_by_model:
        return _cache_by_model[model_id]
    base_url, model_name, api_key, fragments = resolve_llm_for_model(settings, model_id)
    cfg = EffectiveLlmConfig(
        base_url=base_url,
        api_key=api_key,
        model_name=model_name,
        thinking_fragments=fragments,
    )
    _cache_by_model[model_id] = cfg
    return cfg
