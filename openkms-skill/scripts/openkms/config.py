"""Locate and load config.yml (api_base_url + api_key)."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import yaml

_DEFAULT_SKILL_ROOT = Path(__file__).resolve().parents[2]


def _skill_root() -> Path:
    env_root = os.environ.get("OPENKMS_SKILL_ROOT", "").strip()
    if env_root:
        return Path(env_root)
    return _DEFAULT_SKILL_ROOT


def load_config() -> dict[str, Any]:
    skill_root = _skill_root()
    config_path = skill_root / "config.yml"
    env_base = os.environ.get("OPENKMS_API_BASE_URL", "").strip().rstrip("/")
    env_key = os.environ.get("OPENKMS_API_KEY", "").strip()

    raw: dict[str, Any] = {}
    if config_path.is_file():
        loaded = yaml.safe_load(config_path.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            raw = loaded
        elif loaded is not None:
            print("config.yml must be a mapping.", file=sys.stderr)
            sys.exit(2)

    base = env_base or str(raw.get("api_base_url", "")).strip().rstrip("/")
    key = env_key or str(raw.get("api_key", "")).strip()
    if not base or not key:
        print(
            "Set OPENKMS_API_BASE_URL and OPENKMS_API_KEY, or define api_base_url and api_key in config.yml.",
            file=sys.stderr,
        )
        sys.exit(2)

    def _opt_channel_id(key: str) -> str | None:
        v = raw.get(key)
        if v is None:
            return None
        s = str(v).strip()
        return s or None

    return {
        "api_base_url": base,
        "api_key": key,
        "raw": raw,
        "default_document_channel_id": _opt_channel_id("default_document_channel_id"),
        "default_article_channel_id": _opt_channel_id("default_article_channel_id"),
        "default_pipeline_id": _opt_channel_id("default_pipeline_id"),
    }
