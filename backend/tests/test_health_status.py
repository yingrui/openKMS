"""Console health status API."""

from fastapi.testclient import TestClient


def test_health_status_requires_auth(client: TestClient) -> None:
    response = client.get("/api/admin/health-status")
    assert response.status_code == 401
