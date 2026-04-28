"""Pytest configuration and fixtures."""
import os

import pytest
from fastapi.testclient import TestClient

# Ensure production checks don't block tests
os.environ.setdefault("OPENKMS_DEBUG", "true")
os.environ.setdefault("OPENKMS_SECRET_KEY", "test-secret-key-for-pytest")


@pytest.fixture(scope="session")
def client():
    """One TestClient for the session — avoids a second asyncpg/SQLAlchemy loop on lifespan (smoke tests)."""
    from app.main import app

    with TestClient(app) as c:
        yield c
