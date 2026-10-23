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


class TestSessionEvents:
    """Sign-in and sign-out are GETs and a cookie POST, so they record themselves — and the call must match
    `record_audit_event`'s signature. It did not, and `/logout` and `/clear-session` answered 500."""

    def test_logout_is_recorded_as_auth_logout(self, monkeypatch):
        import asyncio

        from app.api import auth as auth_module

        events: list[dict] = []

        async def fake_record(**kwargs) -> None:
            events.append(kwargs)

        monkeypatch.setattr(auth_module, "record_audit_event", fake_record)
        asyncio.run(
            auth_module.record_session_event(
                "logout", {"sub": "u1", "email": "a@b.c", "auth_mode": "api_key"}, via="clear-session"
            )
        )
        assert events == [
            {
                "method": "AUTH",
                "path": "auth/logout",
                "status_code": 200,
                "actor_sub": "u1",
                "actor_name": "a@b.c",
                "auth_mode": "api_key",
                "detail": {"via": "clear-session"},
            }
        ]

    def test_an_unknown_actor_is_still_recorded(self, monkeypatch):
        import asyncio

        from app.api import auth as auth_module

        events: list[dict] = []

        async def fake_record(**kwargs) -> None:
            events.append(kwargs)

        monkeypatch.setattr(auth_module, "record_audit_event", fake_record)
        asyncio.run(
            auth_module.record_session_event("logout", {}, via="clear-session", reason="no_session_token")
        )
        assert events[0]["actor_sub"] is None
        assert events[0]["path"] == "auth/logout"
        # "anonymous" is an answer only when it says why it could not name anyone.
        assert events[0]["detail"] == {"via": "clear-session", "reason": "no_session_token"}


def test_a_forged_or_expired_cookie_yields_no_actor(monkeypatch):
    """A logout still records; it just cannot say who. An unverified decode would let a forged token
    misattribute itself in the log — the one thing an audit log exists to prevent."""
    from fastapi import HTTPException

    from app.api import auth as auth_module

    class FakeSession(dict):
        pass

    class FakeRequest:
        def __init__(self, token: str | None) -> None:
            self.session = FakeSession({} if token is None else {"access_token": token})

    def boom(_token: str) -> dict:
        raise HTTPException(status_code=401, detail="expired")

    monkeypatch.setattr(auth_module, "_verify_token_for_mode", boom)
    assert auth_module._session_actor(FakeRequest("junk")) == ({}, "token_not_verified")
    assert auth_module._session_actor(FakeRequest(None)) == ({}, "no_session_token")
    monkeypatch.setattr(auth_module, "_verify_token_for_mode", lambda _t: {"sub": "u1"})
    assert auth_module._session_actor(FakeRequest("ok")) == ({"sub": "u1"}, None)


def test_only_the_sign_out_that_had_a_session_is_recorded(monkeypatch):
    """The SPA calls `clear-session` once deliberately and again from the session-invalid handler, seconds
    later. The second call has no cookie — nothing was ended, so it must not be a second event."""
    import asyncio

    from app.api import auth as auth_module

    events: list[dict] = []

    async def fake_record(**kwargs) -> None:
        events.append(kwargs)

    class FakeRequest:
        def __init__(self, token: str | None) -> None:
            self.session = {} if token is None else {"access_token": token}

    monkeypatch.setattr(auth_module, "record_audit_event", fake_record)
    monkeypatch.setattr(auth_module, "_verify_token_for_mode", lambda _t: {"sub": "u1", "email": "a@b.c"})

    asyncio.run(auth_module.clear_session(FakeRequest("live-token")))   # the real sign-out
    asyncio.run(auth_module.clear_session(FakeRequest(None)))           # the cleanup that follows
    assert len(events) == 1
    assert events[0]["actor_sub"] == "u1"
    assert events[0]["detail"] == {"via": "clear-session"}


class TestLocalLogin:
    """A local sign-in is a POST, but the actor is in the response body — the middleware sees nothing. It
    records itself, success and failure, and the generic row for the route is suppressed."""

    def test_a_successful_login_names_the_user(self, monkeypatch):
        import asyncio
        from types import SimpleNamespace

        from app.api import auth as auth_module

        events: list[dict] = []

        async def fake_record(**kwargs) -> None:
            events.append(kwargs)

        class FakeRequest:
            session: dict = {}
            state = SimpleNamespace()

        user = SimpleNamespace(
            id="u1", username="yingrui", email="a@b.c", password_hash="h", is_admin=False
        )

        class FakeResult:
            def scalar_one_or_none(self):
                return user

        class FakeDb:
            async def execute(self, *_a, **_k):
                return FakeResult()

        monkeypatch.setattr(auth_module, "record_audit_event", fake_record)
        monkeypatch.setattr(auth_module, "_verify_password", lambda *_: True)
        monkeypatch.setattr(auth_module, "mint_local_user_jwt", lambda _u: "token")

        async def permissions(*_a, **_k):
            return {"data:read"}

        monkeypatch.setattr(auth_module, "resolve_user_permission_keys", permissions)
        monkeypatch.setattr(auth_module.settings, "auth_mode", "local")

        asyncio.run(
            auth_module.login_json(FakeRequest(), auth_module.LoginBody(login="yingrui", password="x"), FakeDb())
        )
        assert events[0]["method"] == "AUTH"
        assert events[0]["path"] == "auth/login"
        assert events[0]["actor_sub"] == "u1"
        assert events[0]["detail"] == {"via": "local-login"}

    def test_a_failed_login_records_the_account_attempted_not_an_actor(self, monkeypatch):
        import asyncio
        from types import SimpleNamespace

        from fastapi import HTTPException

        from app.api import auth as auth_module

        events: list[dict] = []

        async def fake_record(**kwargs) -> None:
            events.append(kwargs)

        class FakeRequest:
            session: dict = {}
            state = SimpleNamespace()
            headers: dict = {}

        class FakeResult:
            def scalar_one_or_none(self):
                return None

        class FakeDb:
            async def execute(self, *_a, **_k):
                return FakeResult()

        monkeypatch.setattr(auth_module, "record_audit_event", fake_record)
        monkeypatch.setattr(auth_module.settings, "auth_mode", "local")

        try:
            asyncio.run(
                auth_module.login_json(
                    FakeRequest(), auth_module.LoginBody(login="Mallory", password="guess"), FakeDb()
                )
            )
        except HTTPException as exc:
            assert exc.status_code == 401
        else:  # pragma: no cover - the call must fail
            raise AssertionError("a bad password must 401")

        assert events[0]["path"] == "auth/login-failed"
        assert events[0]["actor_sub"] is None
        # The account *attempted* is data, not an actor: nobody authenticated.
        assert events[0]["detail"] == {"via": "local-login", "attempted": "Mallory"}
