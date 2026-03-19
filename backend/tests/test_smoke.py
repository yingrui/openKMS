"""Smoke tests for backend API."""
import pytest


@pytest.mark.asyncio
async def test_health(client):
    """Health endpoint returns 200."""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_openapi_docs_available(client):
    """OpenAPI docs are reachable."""
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    data = response.json()
    assert "openapi" in data
    assert "paths" in data
