"""Shared httpx.Client factory with Bearer auth."""
from __future__ import annotations

import httpx

from .config import load_config


def client() -> httpx.Client:
    c = load_config()
    return httpx.Client(
        base_url=c["api_base_url"],
        headers={"Authorization": f"Bearer {c['api_key']}"},
        timeout=300.0,
    )
