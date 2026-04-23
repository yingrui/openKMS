"""Resolve CLI VLM defaults from the backend when env vars are not set."""

from __future__ import annotations

import os
from typing import Any

import requests

from .settings import CliSettings


def _fetch_vlm_api_key_from_models_api(cfg: CliSettings) -> str | None:
    """GET /api/models/document-parse-defaults with CLI auth (Basic or Bearer)."""
    from .auth import try_api_request_auth

    api = (cfg.openkms_api_url or "").strip()
    if not api:
        return None
    cred = try_api_request_auth()
    if not cred:
        return None
    headers, basic = cred
    try:
        r = requests.get(
            f"{api.rstrip('/')}/api/models/document-parse-defaults",
            headers=headers,
            auth=basic,
            timeout=15,
        )
        r.raise_for_status()
        data: dict[str, Any] = r.json()
        key = (data.get("api_key") or "").strip()
        return key or None
    except Exception:
        return None


def resolve_vlm_for_cli(cfg: CliSettings) -> tuple[str, str, str | None]:
    """
    Effective (vlm_url, vlm_model, vlm_api_key) for PaddleOCR-VL.

    - URL/model: if OPENKMS_VLM_URL / OPENKMS_VLM_MODEL are unset, overlay public-config.
    - API key: if OPENKMS_VLM_API_KEY is unset, GET /api/models/document-parse-defaults (authenticated).
    """
    url = (cfg.vlm_url or "").strip() or "http://localhost:8101/"
    model = (cfg.vlm_model or "").strip() or "PaddlePaddle/PaddleOCR-VL-1.5"
    api_key: str | None = (cfg.vlm_api_key or "").strip() or None

    api = (cfg.openkms_api_url or "").strip()
    if api:
        try:
            r = requests.get(f"{api.rstrip('/')}/api/auth/public-config", timeout=15)
            r.raise_for_status()
            data: dict[str, Any] = r.json()
            if "OPENKMS_VLM_URL" not in os.environ:
                u = data.get("document_parse_vlm_url")
                if isinstance(u, str) and u.strip():
                    url = u.strip()
            if "OPENKMS_VLM_MODEL" not in os.environ:
                m = data.get("document_parse_vlm_model")
                if isinstance(m, str) and m.strip():
                    model = m.strip()
        except Exception:
            pass

    if "OPENKMS_VLM_API_KEY" not in os.environ and not api_key:
        api_key = _fetch_vlm_api_key_from_models_api(cfg)

    return url, model, api_key
