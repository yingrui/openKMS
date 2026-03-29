"""OpenID Provider Metadata (OpenID Connect Discovery 1.0)."""

from __future__ import annotations

import httpx

from app.config import settings

_metadata: dict | None = None


def get_oidc_provider_metadata() -> dict:
    """Fetch and cache `{issuer}/.well-known/openid-configuration`."""
    global _metadata
    if _metadata is None:
        issuer = settings.oidc_issuer_url.rstrip("/")
        url = f"{issuer}/.well-known/openid-configuration"
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(url)
            resp.raise_for_status()
            _metadata = resp.json()
    return _metadata


def reset_oidc_provider_metadata() -> None:
    global _metadata
    _metadata = None
