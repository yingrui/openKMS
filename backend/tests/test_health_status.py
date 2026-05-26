"""Console health status API."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


def test_health_status_requires_auth(client: TestClient) -> None:
    response = client.get("/api/admin/health-status")
    assert response.status_code == 401


def test_check_langfuse_skipped_without_base_url(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.admin import health_status
    from app.config import settings

    monkeypatch.setattr(settings, "langfuse_base_url", None)
    monkeypatch.setattr(settings, "langfuse_healthcheck", True)
    status, msg, ms = asyncio.run(health_status._check_langfuse())
    assert status == "skipped"
    assert msg and "LANGFUSE_BASE_URL" in msg
    assert ms is None


def test_check_langfuse_skipped_healthcheck_off(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.admin import health_status
    from app.config import settings

    monkeypatch.setattr(settings, "langfuse_base_url", "https://lf.example")
    monkeypatch.setattr(settings, "langfuse_healthcheck", False)
    status, msg, ms = asyncio.run(health_status._check_langfuse())
    assert status == "skipped"
    assert msg and "LANGFUSE_HEALTHCHECK" in msg
    assert ms is None


def test_check_langfuse_ok_with_mock_client(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.admin import health_status
    from app.config import settings

    monkeypatch.setattr(settings, "langfuse_base_url", "https://lf.example")
    monkeypatch.setattr(settings, "langfuse_healthcheck", True)
    monkeypatch.setattr(settings, "langfuse_secret_key", "sk")
    monkeypatch.setattr(settings, "langfuse_public_key", "pk")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_inner = MagicMock()
    mock_inner.get = AsyncMock(return_value=mock_resp)
    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_inner)
    mock_cm.__aexit__ = AsyncMock(return_value=False)
    mock_class = MagicMock(return_value=mock_cm)

    with patch("app.api.admin.health_status.httpx.AsyncClient", mock_class):
        status, msg, ms = asyncio.run(health_status._check_langfuse())
    assert status == "ok"
    assert ms is not None
    assert msg and "HTTP 200" in msg
    assert "credentials" in msg.lower()
    mock_class.assert_called_once()
    mock_inner.get.assert_called_once()


def test_check_langfuse_error_on_503(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.admin import health_status
    from app.config import settings

    monkeypatch.setattr(settings, "langfuse_base_url", "https://lf.example")
    monkeypatch.setattr(settings, "langfuse_healthcheck", True)

    mock_resp = MagicMock()
    mock_resp.status_code = 503
    mock_inner = MagicMock()
    mock_inner.get = AsyncMock(return_value=mock_resp)
    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_inner)
    mock_cm.__aexit__ = AsyncMock(return_value=False)

    with patch("app.api.admin.health_status.httpx.AsyncClient", MagicMock(return_value=mock_cm)):
        status, msg, ms = asyncio.run(health_status._check_langfuse())
    assert status == "error"
    assert msg and "503" in msg
    assert ms is not None
