"""Execution audit rows are attached to a knowledge base, so writing one needs access to it.

The agent posts these with the *user's* token, which makes this an ordinary ACL question rather than a service call: without
the check, any signed-in user could put "ran python in session …" rows on a knowledge base they cannot read.

Skipped unless the deployment is in local auth mode, like the other end-to-end route tests.
"""
from __future__ import annotations

import os
import uuid

import pytest

class _Denied(Exception):
    """Stands in for the ACL refusal: the point is that nothing is written afterwards."""


needs_local_auth = pytest.mark.skipif(
    os.environ.get("OPENKMS_AUTH_MODE", "oidc") != "local", reason="requires local auth + DB"
)


def _register(client) -> dict[str, str]:
    u = uuid.uuid4().hex[:10]
    res = client.post(
        "/api/auth/register",
        json={"email": f"exec-{u}@example.com", "username": f"execuser{u}", "password": "testpass123"},
    )
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _event(kb_id: str) -> dict[str, object]:
    return {
        "knowledge_base_id": kb_id,
        "session_id": str(uuid.uuid4()),
        "kind": "python",
        "exit_code": 0,
        "duration_ms": 42,
        "code_chars": 10,
        "code_sha": "abc123def456",
    }


@needs_local_auth
def test_the_owner_may_report_an_execution(client):
    owner = _register(client)
    created = client.post("/api/knowledge-bases", headers=owner, json={"name": f"exec {uuid.uuid4().hex[:6]}"})
    assert created.status_code == 200, created.text
    res = client.post("/internal-api/executions", headers=owner, json=_event(created.json()["id"]))
    assert res.status_code == 200, res.text
    assert res.json() == {"ok": True}


@needs_local_auth
def test_a_stranger_may_not(client):
    owner = _register(client)
    created = client.post("/api/knowledge-bases", headers=owner, json={"name": f"exec {uuid.uuid4().hex[:6]}"})
    assert created.status_code == 200, created.text
    stranger = _register(client)
    res = client.post("/internal-api/executions", headers=stranger, json=_event(created.json()["id"]))
    assert res.status_code in (403, 404), res.text


def test_the_acl_check_is_the_first_thing_the_handler_does(monkeypatch):
    """No database here: the point is that the row is never written when the caller cannot read the KB."""
    import asyncio

    from starlette.requests import Request

    from app.api.internal import executions as api
    from app.services.identity.acl.resource_acl_constants import PERM_READ

    calls: list[str] = []

    async def refuse(db, request, kb_id, perm):
        calls.append(f"acl:{kb_id}:{perm}")
        raise _Denied

    async def never_writes(**kwargs):  # pragma: no cover - must not run
        calls.append("audit")

    monkeypatch.setattr(api, "load_knowledge_base_scoped", refuse)
    monkeypatch.setattr(api, "record_audit_event", never_writes)

    request = Request({"type": "http", "method": "POST", "path": "/internal-api/executions", "headers": []})
    request.state.openkms_jwt_payload = {"sub": "user-1", "auth_mode": "local"}
    body = api.ExecutionEvent(
        knowledge_base_id="kb-1", session_id="s-1", kind="python", duration_ms=1, code_chars=3, code_sha="abc"
    )
    with pytest.raises(_Denied):
        asyncio.run(api.record_execution(body, request, db=object()))
    assert calls == [f"acl:kb-1:{PERM_READ}"]
