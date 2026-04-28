"""Smoke tests for backend API."""

from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    """Health endpoint returns 200."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_docs_available(client: TestClient) -> None:
    """OpenAPI docs are reachable."""
    response = client.get("/openapi.json")
    assert response.status_code == 200
    data = response.json()
    assert "openapi" in data
    assert "paths" in data
