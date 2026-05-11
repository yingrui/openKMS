"""Locate and load config.yml (api_base_url + api_key)."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import yaml

SKILL_ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = SKILL_ROOT / "config.yml"


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.is_file():
        print(
            f"Missing {CONFIG_PATH}. Copy config.yml.example to config.yml and set api_base_url and api_key.",
            file=sys.stderr,
        )
        sys.exit(2)
    raw = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        print("config.yml must be a mapping.", file=sys.stderr)
        sys.exit(2)
    base = str(raw.get("api_base_url", "")).strip().rstrip("/")
    key = str(raw.get("api_key", "")).strip()
    if not base or not key:
        print("config.yml must define api_base_url and api_key.", file=sys.stderr)
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
    }
