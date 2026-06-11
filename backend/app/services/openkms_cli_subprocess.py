"""Environment for worker-spawned ``openkms-cli`` subprocesses."""

from __future__ import annotations

import os

from app.config import settings


def openkms_cli_auth_env() -> dict[str, str]:
    """Auth-related env vars injected into every openkms-cli subprocess."""
    env: dict[str, str] = {
        "OPENKMS_AUTH_MODE": (settings.auth_mode or "oidc").strip().lower(),
        "OPENKMS_CLI_BASIC_USER": settings.cli_basic_user,
        "OPENKMS_CLI_BASIC_PASSWORD": settings.cli_basic_password,
        "OPENKMS_CLI_OIDC_CLIENT_ID": settings.cli_oidc_client_id,
        "OPENKMS_CLI_OIDC_CLIENT_SECRET": settings.cli_oidc_client_secret,
    }
    token_url = (settings.oidc_token_url or "").strip()
    if token_url:
        env["OPENKMS_OIDC_TOKEN_URL"] = token_url
    return env


def build_openkms_cli_subprocess_env(**extra: str) -> dict[str, str]:
    """Base subprocess env: worker os.environ + CLI auth + optional overrides."""
    return {**os.environ, **openkms_cli_auth_env(), **extra}
