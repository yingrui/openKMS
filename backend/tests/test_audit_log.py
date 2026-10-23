"""The audit log: what a path means, and when a mutation gets recorded.

No database and no token here — the middleware is exercised against a two-route fake app, which is exactly
the surface it has: the method, the path, the caller the auth layer put on `request.state`, and the status.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI, Request, Response
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

    @app.post("/api/functions")
    async def create_function() -> dict[str, str]:
        return {"id": "fn-1", "api_name": "probe", "display_name": "每日行情入库"}

    @app.post("/api/datasets")
    async def create() -> dict[str, str]:
        return {"id": "0f1e2d3c-4b5a-4969-8787-6a5b4c3d2e1f", "name": "new"}

    @app.post("/api/bulk")
    async def bulk() -> list[str]:
        return ["not-an-object"]

    @app.post("/api/big")
    async def big() -> dict[str, str]:
        return {"id": "x", "pad": "y" * (audit_middleware.MAX_CAPTURE + 10)}

    @app.get("/api/datasets")
    async def listing() -> dict[str, list[str]]:
        return {"items": []}

    @app.delete("/api/functions/fn-1", status_code=204)
    async def destroy(request: Request) -> Response:
        # What a delete handler does: the row is about to be gone, so only the handler knows the name.
        request.state.audit_label = "每日行情入库"
        return Response(status_code=204)

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


def test_a_mutation_is_recorded_with_its_status_and_the_id_it_created(recorded):
    TestClient(_fake_app()).post("/api/datasets")
    assert recorded == [
        {
            "method": "POST",
            "path": "/api/datasets",
            "status_code": 200,
            "actor_sub": None,
            "actor_name": None,
            "auth_mode": None,
            "response_id": "0f1e2d3c-4b5a-4969-8787-6a5b4c3d2e1f",
            "response_label": "new",
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
            "response_id": None,
            "response_label": None,
            "detail": {"error": "RuntimeError"},
        }
    ]


def test_a_response_that_is_not_an_object_yields_no_id(recorded):
    TestClient(_fake_app()).post("/api/bulk")
    assert recorded[0]["response_id"] is None


def test_an_oversized_response_is_not_buffered(recorded):
    TestClient(_fake_app()).post("/api/big")
    assert recorded[0]["response_id"] is None


class TestWorkerRuns:
    """A worker mutates data with no HTTP request, so it records its own event."""

    def test_a_job_records_job_and_its_id_as_the_subject(self):
        from app.services.audit import job_audit_fields

        assert job_audit_fields("run_kb_index", 42) == {
            "method": "JOB",
            "path": "job/run_kb_index",
            "resource_type": "jobs",
            "resource_id": "42",
            "detail": {"job_id": "42"},
        }

    def test_a_job_without_an_id_still_records(self):
        from app.services.audit import job_audit_fields

        fields = job_audit_fields("run_pipeline", None)
        assert fields["resource_id"] is None
        assert fields["detail"] is None
        assert fields["path"] == "job/run_pipeline"

def test_a_name_from_the_response_is_recorded_beside_the_id(recorded):
    TestClient(_fake_app()).post("/api/datasets")
    assert recorded[0]["response_label"] == "new"


def test_a_delete_records_the_name_only_the_handler_knew(recorded):
    # A 204 carries no body, so the id in the path would be all the log had — "deleted something".
    assert TestClient(_fake_app()).delete("/api/functions/fn-1").status_code == 204
    assert recorded[0]["response_id"] is None
    assert recorded[0]["response_label"] == "每日行情入库"
    assert recorded[0]["status_code"] == 204

def test_the_label_prefers_a_display_name_over_a_machine_name(recorded):
    TestClient(_fake_app()).post("/api/functions")
    assert recorded[0]["response_label"] == "每日行情入库"


def test_a_session_cookie_sync_is_not_an_event(recorded):
    """`/sync-session` fires on every app load and changes nothing after the first — noise, not a login."""
    app = _fake_app()

    @app.post("/sync-session")
    async def sync() -> dict[str, bool]:
        return {"ok": True}

    TestClient(app).post("/sync-session")
    assert recorded == []
