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

    try:
        data = _fetch_agent_llm_defaults(cfg)
    except RuntimeError:
        raise
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
