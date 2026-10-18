"""The audit log: what a path means, and when a mutation gets recorded.

No database and no token here — the middleware is exercised against a two-route fake app, which is exactly
the surface it has: the method, the path, the caller the auth layer put on `request.state`, and the status.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.middleware import audit as audit_middleware
from app.services.audit import audit_target


class TestAuditTarget:
    @pytest.mark.parametrize(
        "path, expected",
        [
            ("/api/datasets/d66d645b-72f9-45b9-b3bb-87ddeb5ed217", ("datasets", "d66d645b-72f9-45b9-b3bb-87ddeb5ed217")),
            ("/api/datasets", ("datasets", None)),
            ("/api/stories/1b9f0c4e-0a1b-4c2d-8e3f-5a6b7c8d9e0f/run", ("stories", "1b9f0c4e-0a1b-4c2d-8e3f-5a6b7c8d9e0f")),
            ("/api/console/audit-events", ("console", None)),
            ("/api/system/settings", ("system", None)),
            ("/health", ("health", None)),
            ("/", (None, None)),
            ("/api/datasets?limit=5", ("datasets", None)),
        ],
    )
    def test_reads_a_subject_out_of_the_path(self, path, expected):
        assert audit_target(path) == expected


def _fake_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(audit_middleware.AuditMiddleware)

    @app.post("/api/datasets")
    async def create() -> dict[str, str]:
        return {"id": "new"}

    @app.get("/api/datasets")
    async def listing() -> dict[str, list[str]]:
        return {"items": []}

    @app.post("/api/datasets/boom")
    async def boom() -> dict[str, str]:
        raise RuntimeError("exploded")

    return app


@pytest.fixture
def recorded(monkeypatch):
    events: list[dict] = []

    async def fake_record(**kwargs) -> None:
        events.append(kwargs)

    monkeypatch.setattr(audit_middleware, "record_audit_event", fake_record)
    return events


def test_a_mutation_is_recorded_with_its_status(recorded):
    client = TestClient(_fake_app())
    client.post("/api/datasets")
    assert recorded == [
        {
            "method": "POST",
            "path": "/api/datasets",
            "status_code": 200,
            "actor_sub": None,
            "actor_name": None,
            "auth_mode": None,
            "detail": None,
        }
    ]


def test_a_read_is_not_recorded(recorded):
    TestClient(_fake_app()).get("/api/datasets")
    assert recorded == []


def test_a_crash_is_recorded_before_it_propagates(recorded):
    # The mutation most worth seeing: the endpoint raised, so no handler-level log could have caught it.
    client = TestClient(_fake_app(), raise_server_exceptions=False)
    assert client.post("/api/datasets/boom").status_code == 500
    assert recorded == [
        {
            "method": "POST",
            "path": "/api/datasets/boom",
            "status_code": 500,
            "actor_sub": None,
            "actor_name": None,
            "auth_mode": None,
            "detail": {"error": "RuntimeError"},
        }
    ]
