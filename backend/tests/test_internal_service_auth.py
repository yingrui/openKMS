"""Internal service auth for worker/scheduler HTTP clients."""

from unittest.mock import MagicMock, patch

import pytest

from app.services import internal_service_auth as auth


def setup_function() -> None:
    auth.reset_oidc_token_cache_for_tests()


def test_local_mode_uses_worker_basic(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "auth_mode", "local")
    monkeypatch.setattr(settings, "worker_basic_user", "openkms-worker")
    monkeypatch.setattr(settings, "worker_basic_password", "secret")

    headers, basic = auth.build_internal_service_request_auth()
    assert headers == {}
    assert basic is not None
    assert basic._auth_header == "Basic b3Blbmttcy13b3JrZXI6c2VjcmV0"


def test_local_mode_requires_worker_basic(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "auth_mode", "local")
    monkeypatch.setattr(settings, "worker_basic_user", "")
    monkeypatch.setattr(settings, "worker_basic_password", "")

    with pytest.raises(ValueError, match="OPENKMS_WORKER_BASIC"):
        auth.build_internal_service_request_auth()


def test_oidc_mode_uses_worker_client_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "auth_mode", "oidc")
    monkeypatch.setattr(settings, "worker_oidc_client_id", "openkms-worker")
    monkeypatch.setattr(settings, "worker_oidc_client_secret", "worker-secret")
    monkeypatch.setattr(settings, "oidc_token_url", "https://idp.example/token")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"access_token": "tok-abc", "expires_in": 300}
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.post.return_value = mock_resp

    with patch("app.services.internal_service_auth.httpx.Client", return_value=mock_client):
        headers, basic = auth.build_internal_service_request_auth()

    assert basic is None
    assert headers["Authorization"] == "Bearer tok-abc"
    mock_client.post.assert_called_once()
    assert mock_client.post.call_args.kwargs["data"]["client_id"] == "openkms-worker"
