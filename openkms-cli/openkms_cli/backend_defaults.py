"""Resolve CLI VLM defaults from the backend when env vars are not set."""

from __future__ import annotations

import os
from typing import Any

import requests

from .settings import CliSettings

_INTERNAL_DOCUMENT_PARSE_DEFAULTS = "/internal-api/models/document-parse-defaults"


def _merge_document_parse_defaults_payload(
    url: str,
    model: str,
    api_key: str | None,
    *,
    need_url: bool,
    need_model: bool,
    need_key: bool,
    model_name_param: str | None,
    data: dict[str, Any],
) -> tuple[str, str, str | None]:
    """Apply JSON from document-parse-defaults into current url/model/api_key (testable pure merge)."""
    if need_url:
        u = (data.get("base_url") or "").strip()
        if u:
            url = u
    if need_key:
        k = (data.get("api_key") or "").strip()
        if k:
            api_key = k
    resolved_m = (data.get("model_name") or "").strip()
    if need_model or model_name_param is not None:
        if resolved_m:
            model = resolved_m
    return url, model, api_key


def _fetch_document_parse_defaults(
    cfg: CliSettings, model_name_query: str | None
) -> dict[str, Any] | None:
    """GET /internal-api/models/document-parse-defaults with CLI auth (Basic or Bearer)."""
    from .auth import try_api_request_auth

    api = (cfg.openkms_api_url or "").strip()
    if not api:
        return None
    cred = try_api_request_auth()
    if not cred:
        return None
    headers, basic = cred
    params: dict[str, str] = {}
    if model_name_query and model_name_query.strip():
        params["model_name"] = model_name_query.strip()
    try:
        r = requests.get(
            f"{api.rstrip('/')}{_INTERNAL_DOCUMENT_PARSE_DEFAULTS}",
            headers=headers,
            auth=basic,
            params=params or None,
            timeout=15,
        )
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def resolve_vlm_for_cli(cfg: CliSettings) -> tuple[str, str, str | None]:
    """
    Effective (vlm_url, vlm_model, vlm_api_key) for PaddleOCR-VL.

    When OPENKMS_API_URL is set and CLI auth succeeds, merges from
    GET /internal-api/models/document-parse-defaults. Optional query
    ``model_name`` is sent when OPENKMS_VLM_MODEL is set in the environment
    so the backend can return that vl/ocr row's URL and key, or the default
    row if no match.
    """
    url = (cfg.vlm_url or "").strip() or "http://localhost:8101/"
    model = (cfg.vlm_model or "").strip() or "PaddlePaddle/PaddleOCR-VL-1.5"
    api_key: str | None = (cfg.vlm_api_key or "").strip() or None

    api = (cfg.openkms_api_url or "").strip()
    if not api:
        return url, model, api_key

    need_url = "OPENKMS_VLM_URL" not in os.environ
    need_model = "OPENKMS_VLM_MODEL" not in os.environ
    need_key = "OPENKMS_VLM_API_KEY" not in os.environ and not api_key
    if not (need_url or need_model or need_key):
        return url, model, api_key

    model_name_param: str | None = None
    if "OPENKMS_VLM_MODEL" in os.environ:
        v = os.environ["OPENKMS_VLM_MODEL"].strip()
        if v:
            model_name_param = v

    data = _fetch_document_parse_defaults(cfg, model_name_param)
    if not data:
        return url, model, api_key

    return _merge_document_parse_defaults_payload(
        url,
        model,
        api_key,
        need_url=need_url,
        need_model=need_model,
        need_key=need_key,
        model_name_param=model_name_param,
        data=data,
    )
