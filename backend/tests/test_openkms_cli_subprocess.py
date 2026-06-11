"""Tests for worker → openkms-cli subprocess environment."""

import pytest

from app.config import settings
from app.services.openkms_cli_subprocess import openkms_cli_auth_env


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
