"""Tests for worker → openkms-cli subprocess environment."""

import sys

import pytest

from app.config import settings
from app.services.openkms_cli_subprocess import (
    openkms_cli_auth_env,
    prepare_openkms_cli_argv,
    resolve_openkms_cli_argv,
)


def test_openkms_cli_auth_env_injects_oidc_from_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "auth_mode", "oidc")
    monkeypatch.setattr(settings, "cli_basic_user", "")
    monkeypatch.setattr(settings, "cli_basic_password", "")
    monkeypatch.setattr(settings, "cli_oidc_client_id", "openkms-cli")
    monkeypatch.setattr(settings, "cli_oidc_client_secret", "cli-secret")
    monkeypatch.setattr(settings, "oidc_token_url", "http://idp/token")

    env = openkms_cli_auth_env()

    assert env["OPENKMS_AUTH_MODE"] == "oidc"
    assert env["OPENKMS_CLI_OIDC_CLIENT_ID"] == "openkms-cli"
    assert env["OPENKMS_CLI_OIDC_CLIENT_SECRET"] == "cli-secret"
    assert env["OPENKMS_OIDC_TOKEN_URL"] == "http://idp/token"


def test_openkms_cli_auth_env_omits_empty_token_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "auth_mode", "local")
    monkeypatch.setattr(settings, "cli_basic_user", "openkms-cli")
    monkeypatch.setattr(settings, "cli_basic_password", "secret")
    monkeypatch.setattr(settings, "cli_oidc_client_id", "openkms-cli")
    monkeypatch.setattr(settings, "cli_oidc_client_secret", "")
    monkeypatch.setattr(settings, "oidc_token_url", "")

    env = openkms_cli_auth_env()

    assert env["OPENKMS_CLI_BASIC_USER"] == "openkms-cli"
    assert "OPENKMS_OIDC_TOKEN_URL" not in env


def test_resolve_openkms_cli_argv_honors_explicit_setting(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "openkms_cli_executable", "/custom/bin/openkms-cli")
    assert resolve_openkms_cli_argv() == ["/custom/bin/openkms-cli"]


def test_resolve_openkms_cli_argv_falls_back_to_python_module(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "openkms_cli_executable", "")
    monkeypatch.setattr("app.services.openkms_cli_subprocess.shutil.which", lambda _name: None)
    assert resolve_openkms_cli_argv() == [sys.executable, "-m", "openkms_cli"]


def test_prepare_openkms_cli_argv_replaces_entrypoint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "openkms_cli_executable", "/venv/openkms-cli")
    argv = prepare_openkms_cli_argv("openkms-cli pipeline run --pipeline-name kb-index")
    assert argv[:3] == ["/venv/openkms-cli", "pipeline", "run"]
