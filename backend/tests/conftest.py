"""Pytest configuration and fixtures."""
import os

import pytest
from httpx import ASGITransport, AsyncClient

# Ensure production checks don't block tests
os.environ.setdefault("OPENKMS_DEBUG", "true")
os.environ.setdefault("OPENKMS_SECRET_KEY", "test-secret-key-for-pytest")

# Load app after env is set
from app.main import app


@pytest.fixture
async def client():
    """Async HTTP client for testing FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
