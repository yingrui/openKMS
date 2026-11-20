"""Resolve qa-agent LLM defaults from the backend internal-api (same auth as openkms-cli)."""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from .auth import api_request_auth, auth_expired_response
from .config import Settings

logger = logging.getLogger(__name__)

_INTERNAL_LLM_DEFAULTS = "/internal-api/models/llm-defaults"


def _merge_agent_llm_defaults_payload(
    base_url: str,
    model_name: str,
    api_key: str,
    *,
    need_url: bool,
    need_model: bool,
    need_key: bool,
    data: dict[str, Any],
) -> tuple[str, str, str]:
    if need_url:
        u = (data.get("base_url") or "").strip()
        if u:
            base_url = u
    if need_model:
        m = (data.get("model_name") or "").strip()
        if m:
            model_name = m
    if need_key:
        k = (data.get("api_key") or "").strip()
        if k:
            api_key = k
    return base_url, model_name, api_key


def _fetch_agent_llm_defaults(cfg: Settings) -> dict[str, Any] | None:
    """GET /internal-api/models/llm-defaults with qa-agent service auth (Basic or Bearer)."""
    api = (cfg.openkms_backend_url or "").strip()
    if not api:
        return None
    try:
        headers, basic = api_request_auth()
    except ValueError as exc:
        raise RuntimeError(f"qa-agent service auth failed: {exc}") from exc

    url = f"{api.rstrip('/')}{_INTERNAL_LLM_DEFAULTS}"
    auth = httpx.BasicAuth(basic[0], basic[1]) if basic else None
    try:
        logger.debug("GET %s", url)
        r = httpx.get(url, headers=headers, auth=auth, timeout=15.0)
        if auth_expired_response(r) and not basic:
            headers, basic = api_request_auth()
            auth = httpx.BasicAuth(basic[0], basic[1]) if basic else None
            r = httpx.get(url, headers=headers, auth=auth, timeout=15.0)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500] if exc.response is not None else str(exc)
        raise RuntimeError(
            f"Backend llm-defaults returned HTTP {exc.response.status_code}: {detail}"
        ) from exc
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Could not reach backend llm-defaults at {url!r}: {exc}") from exc


def _fetch_json(url: str, *, what: str) -> dict[str, Any] | None:
    """GET an internal endpoint with qa-agent service auth (Basic or Bearer), refreshing once on expiry."""
    try:
        headers, basic = api_request_auth()
    except ValueError as exc:
        raise RuntimeError(f"qa-agent service auth failed: {exc}") from exc
    auth = httpx.BasicAuth(basic[0], basic[1]) if basic else None
    try:
        r = httpx.get(url, headers=headers, auth=auth, timeout=15.0)
        if auth_expired_response(r) and not basic:
            headers, basic = api_request_auth()
            auth = httpx.BasicAuth(basic[0], basic[1]) if basic else None
            r = httpx.get(url, headers=headers, auth=auth, timeout=15.0)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500] if exc.response is not None else str(exc)
        raise RuntimeError(f"Backend {what} returned HTTP {exc.response.status_code}: {detail}") from exc


def resolve_llm_for_model(cfg: Settings, model_id: str) -> tuple[str, str, str, dict[str, Any]]:
    """Endpoint, model name, key and thinking fragments for one registered chat model.

    An agent may name a model that belongs to a different provider than the deployment default, so the endpoint and
    key come from that model's provider rather than from the default. `OPENKMS_LLM_MODEL_*` overrides are not applied
    here: they describe the deployment default, and applying them to every model would defeat the point.
    """
    api = (cfg.openkms_backend_url or "").strip()
    if not api:
        raise RuntimeError("OPENKMS_BACKEND_URL is required to resolve a named model")
    data = _fetch_json(f"{api.rstrip('/')}/internal-api/models/{model_id}/llm-credentials",
                       what=f"llm-credentials({model_id})")
    if not data or not data.get("base_url") or not data.get("model_name"):
        raise RuntimeError(f"Backend returned no endpoint for model {model_id!r}")
    thinking = data.get("thinking")
    return (
        str(data["base_url"]),
        str(data["model_name"]),
        str(data.get("api_key") or "no-key"),
        thinking if isinstance(thinking, dict) else {},
    )


def resolve_llm_for_agent(cfg: Settings) -> tuple[str, str, str]:
    """
    Effective (base_url, model_name, api_key) for ChatOpenAI.

    When ``OPENKMS_BACKEND_URL`` is set and service auth succeeds, merges from
    ``GET /internal-api/models/llm-defaults``. Explicit ``OPENKMS_LLM_MODEL_*`` env vars
    override individual fields.
    """
    base_url = (cfg.llm_base_url or "").strip()
    model_name = (cfg.llm_model_name or "").strip()
    api_key = (cfg.llm_api_key or "").strip()

    need_url = "OPENKMS_LLM_MODEL_BASE_URL" not in os.environ
    need_model = "OPENKMS_LLM_MODEL_NAME" not in os.environ
    need_key = "OPENKMS_LLM_MODEL_API_KEY" not in os.environ
    if not (need_url or need_model or need_key):
        if not base_url or not model_name:
            raise RuntimeError(
                "OPENKMS_LLM_MODEL_BASE_URL and OPENKMS_LLM_MODEL_NAME must be set when using env overrides"
            )
        return base_url, model_name, api_key or "no-key"

    data = _fetch_agent_llm_defaults(cfg)
    if not data:
        raise RuntimeError(
            "Could not resolve LLM settings: OPENKMS_BACKEND_URL is unset and no "
            "OPENKMS_LLM_MODEL_* overrides are configured."
        )

    base_url, model_name, api_key = _merge_agent_llm_defaults_payload(
        base_url,
        model_name,
        api_key,
        need_url=need_url,
        need_model=need_model,
        need_key=need_key,
        data=data,
    )
    if not base_url or not model_name:
        raise RuntimeError(
            "Backend returned no LLM base_url or model_name. Add a chat-completions model on Models "
            "and set it as default for that API kind."
        )
    return base_url, model_name, api_key or "no-key"


def resolve_thinking_fragments(cfg: Settings) -> dict[str, dict[str, object]]:
    """The provider's thinking fragments, as the backend reports them.

    The provider knows how it wants to be asked; this side only merges the chosen fragment, so adding a vendor is a
    provider setting rather than a code change here.
    """
    try:
        data = _fetch_agent_llm_defaults(cfg)
    except RuntimeError:
        return {}
    raw = (data or {}).get("thinking")
    if not isinstance(raw, dict):
        return {}
    return {k: v for k, v in raw.items() if k in {"on", "off"} and isinstance(v, dict)}


def fetch_skill_prompts(
    cfg: Settings, installed: dict[str, str], registry: str = "agent"
) -> list[dict[str, Any]]:
    """`SKILL.md` text for each installed skill, read from the backend that owns the registry.

    `registry` names which one the ids belong to — Agent Project packages (`agent`) or workforce skills
    (`workforce`). They are separate assets, so the same slug can exist in both and a guess would serve the wrong text.

    A missing skill is skipped rather than failing the answer: the agent was configured with a package that has since
    been removed, and refusing to answer would be a worse outcome than answering without it.
    """
    out: list[dict[str, Any]] = []
    api = (cfg.openkms_backend_url or "").strip()
    if not api or not installed:
        return out
    for skill_id, version in installed.items():
        try:
            data = _fetch_json(
                f"{api.rstrip('/')}/internal-api/skills/{registry}/{skill_id}/{version}/prompt",
                what=f"skill({skill_id}@{version})",
            )
        except Exception:
            logger.exception("skill %s@%s could not be loaded; continuing without it", skill_id, version)
            continue
        if data and data.get("content"):
            out.append(
                {
                    "skill_id": skill_id,
                    "display_name": data.get("display_name") or skill_id,
                    "version": version,
                    "content": data["content"],
                }
            )
    return out
