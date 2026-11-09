"""Environment and argv resolution for worker-spawned ``openkms-cli`` subprocesses."""

from __future__ import annotations

import os
import shlex
import shutil
import sys

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
    env = {**os.environ, **openkms_cli_auth_env(), **extra}
    venv_bin = os.path.dirname(sys.executable)
    path = env.get("PATH", "")
    if venv_bin and venv_bin not in path.split(os.pathsep):
        env["PATH"] = f"{venv_bin}{os.pathsep}{path}" if path else venv_bin
    return env


def resolve_openkms_cli_argv() -> list[str]:
    """Executable prefix for spawning openkms-cli (console script or ``python -m``)."""
    explicit = (settings.openkms_cli_executable or "").strip()
    if explicit:
        return shlex.split(explicit)
    script = shutil.which("openkms-cli")
    if script:
        return [script]
    return [sys.executable, "-m", "openkms_cli"]


def prepare_openkms_cli_argv(command: str) -> list[str]:
    """Parse a pipeline command template and resolve the ``openkms-cli`` entrypoint."""
    parts = shlex.split(command)
    if not parts:
        raise ValueError("Pipeline command is empty")
    if parts[0] == "openkms-cli":
        return [*resolve_openkms_cli_argv(), *parts[1:]]
    return parts
